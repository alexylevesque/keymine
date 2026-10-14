import type { WebSocket } from "ws";
import { db } from "@/lib/db";
import { mergeKeyStats, recomputeUserStats } from "@/lib/stats";
import { handOverHostDuringRace } from "@/lib/lobby-sweep";
import { assertTransition } from "@/lib/race/state";
import { RaceEngine, type EngineEvent, type RacerInit } from "@/lib/race/engine";
import { isBotLevel } from "@/lib/race/bots";
import { loadCorpus } from "@/lib/text/service";
import { toBonusKinds } from "@/lib/lobby-choices";
import type { RealtimeIdentity } from "./auth";
import { createRateLimiter, parseMessage, raceClientMessage } from "./protocol";

// Une « salle de course » en mémoire : un moteur (lib/race/engine) + les
// sockets connectés. Le serveur est la source de vérité (COURSE-06) : il fixe
// le départ, valide la progression, applique les bonus et classe.

const TICK_MS = 250; // 4 mises à jour par seconde (COURSE-05)
const CHECKPOINT_MS = 2_000; // persistance périodique pour survivre à un redémarrage

type Phase = "countdown" | "racing" | "finished";

type Room = {
  raceId: string;
  lobbyId: string;
  engine: RaceEngine;
  startsAtMs: number;
  phase: Phase;
  /** `u:<id>` / `g:<id>` → identifiant du participant (course) ou null pour un spectateur. */
  members: Map<string, { racerId: string | null }>;
  sockets: Map<string, Set<WebSocket>>; // racerId → sockets
  spectators: Set<WebSocket>;
  avatars: Map<string, string | null>;
  tickTimer: ReturnType<typeof setInterval> | null;
  lastCheckpointMs: number;
  persisting: boolean;
};

const rooms = new Map<string, Room>();
const loading = new Map<string, Promise<Room | null>>();

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function allSockets(room: Room): WebSocket[] {
  return [...[...room.sockets.values()].flatMap((s) => [...s]), ...room.spectators];
}

function broadcast(room: Room, payload: unknown) {
  const text = JSON.stringify(payload);
  for (const s of allSockets(room)) if (s.readyState === s.OPEN) s.send(text);
}

function stateMessage(room: Room, now: number) {
  return {
    type: "state" as const,
    raceId: room.raceId,
    phase: room.phase,
    startsAt: room.startsAtMs,
    endsAt: room.engine.endsAtMs,
    serverNow: now,
    participants: room.engine
      .snapshot(now)
      .map((v) => ({ ...v, avatarUrl: room.avatars.get(v.id) ?? null })),
  };
}

export async function loadRoom(raceId: string): Promise<Room | null> {
  const existing = rooms.get(raceId);
  if (existing) return existing;
  const pending = loading.get(raceId);
  if (pending) return pending;
  const promise = createRoom(raceId).finally(() => loading.delete(raceId));
  loading.set(raceId, promise);
  return promise;
}

async function createRoom(raceId: string): Promise<Room | null> {
  const race = await db.selectFrom("races").selectAll().where("id", "=", raceId).executeTakeFirst();
  if (!race) return null;
  const lobby = await db
    .selectFrom("lobbies")
    .select(["id", "error_mode", "penalty_seconds", "status"])
    .where("id", "=", race.lobby_id)
    .executeTakeFirst();
  if (!lobby) return null;

  const rows = await db
    .selectFrom("race_participants")
    .leftJoin("users", "users.id", "race_participants.user_id")
    .select([
      "race_participants.id",
      "race_participants.user_id",
      "race_participants.guest_id",
      "race_participants.display_name",
      "race_participants.is_bot",
      "race_participants.bot_level",
      "race_participants.role",
      "race_participants.progress_chars",
      "race_participants.error_count",
      "users.avatar_url",
    ])
    .where("race_id", "=", raceId)
    .execute();

  const corpus = await loadCorpus();
  const inits: RacerInit[] = [];
  const members = new Map<string, { racerId: string | null }>();
  const avatars = new Map<string, string | null>();
  for (const row of rows) {
    const key = row.user_id ? `u:${row.user_id}` : row.guest_id ? `g:${row.guest_id}` : null;
    if (row.role === "participant") {
      inits.push({
        id: row.id,
        name: row.display_name,
        text: race.text_content,
        isBot: row.is_bot,
        botLevel: row.bot_level && isBotLevel(row.bot_level) ? row.bot_level : null,
        userId: row.user_id,
        guestId: row.guest_id,
        progress: row.progress_chars,
        errors: row.error_count,
      });
      avatars.set(row.id, row.avatar_url);
      if (key) members.set(key, { racerId: row.id });
    } else if (key) {
      members.set(key, { racerId: null });
    }
  }

  const startsAtMs = new Date(race.starts_at).getTime();
  const engine = new RaceEngine(
    {
      seed: race.seed || hashString(raceId),
      startsAtMs,
      durationMs: race.duration_seconds * 1_000,
      errorMode: lobby.error_mode,
      penaltySeconds: lobby.penalty_seconds,
      comebackBonus: race.comeback_bonus,
      bonusKinds: toBonusKinds(race.bonus_kinds),
      language: race.language,
      wordPool: corpus.words[race.language],
    },
    inits,
  );

  const room: Room = {
    raceId,
    lobbyId: lobby.id,
    engine,
    startsAtMs,
    phase:
      race.status === "finished" ? "finished" : race.status === "racing" ? "racing" : "countdown",
    members,
    sockets: new Map(),
    spectators: new Set(),
    avatars,
    tickTimer: null,
    lastCheckpointMs: 0,
    persisting: false,
  };
  rooms.set(raceId, room);
  if (room.phase !== "finished") {
    room.tickTimer = setInterval(() => void tick(room), TICK_MS);
    // Humains non connectés au départ : le compte à rebours de 30 s (COURSE-08) commence maintenant.
    for (const r of engine.racers.values())
      if (!r.isBot) engine.setConnected(r.id, false, Date.now());
  }
  return room;
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dispatchEvents(room: Room, events: EngineEvent[]) {
  for (const event of events) {
    if (event.type === "bonus") {
      broadcast(room, { type: "bonus", bonus: event.bonus, label: event.label });
    } else if (event.type === "text") {
      for (const socket of room.sockets.get(event.racerId) ?? []) {
        send(socket, { type: "text", text: event.text, progress: event.progress });
      }
    } else if (event.type === "abandoned") {
      void releaseMember(room, event.racerId).catch((e) =>
        console.error("[realtime] libération", e),
      );
    }
  }
}

/**
 * Un joueur qui abandonne (ou qui reste déconnecté trop longtemps) quitte la salle : il n'y est plus
 * « actif », donc il peut créer ou rejoindre une autre salle (SALLE-06), et il ne peut pas revenir
 * dans cette course (SALLE-09 : on ne rejoint pas une salle en cours de course).
 * Ses résultats restent enregistrés et apparaissent dans la section « abandons » de son historique.
 */
async function releaseMember(room: Room, racerId: string) {
  const racer = room.engine.racers.get(racerId);
  if (!racer || racer.isBot || (!racer.userId && !racer.guestId)) return;
  await db
    .updateTable("lobby_players")
    .set({ active: false })
    .where("lobby_id", "=", room.lobbyId)
    .where((eb) =>
      racer.userId ? eb("user_id", "=", racer.userId) : eb("guest_id", "=", racer.guestId),
    )
    .execute();
  if (racer.userId) await handOverHostDuringRace(room.lobbyId, racer.userId);
}

async function tick(room: Room) {
  // Pendant l'enregistrement des résultats, aucun autre tick ne doit rien diffuser.
  if (room.persisting) return;
  const now = Date.now();
  if (room.phase === "countdown" && now >= room.startsAtMs) {
    room.phase = "racing";
    await setRaceStatus(room, "racing").catch((e) => console.error("[realtime] départ", e));
  }
  if (room.phase === "racing") {
    dispatchEvents(room, room.engine.tick(now));
    if (room.engine.isFinalized) {
      // Les résultats sont écrits AVANT d'annoncer la fin : les clients redirigent vers la page des
      // résultats dès qu'ils reçoivent « finished » et elle doit y trouver toutes les lignes (RES-02).
      await persistResults(room, now).catch((e) => console.error("[realtime] résultats", e));
      room.phase = "finished";
      broadcast(room, stateMessage(room, now));
      stopRoom(room);
      return;
    }
    if (now - room.lastCheckpointMs >= CHECKPOINT_MS) {
      room.lastCheckpointMs = now;
      void checkpoint(room);
    }
  }
  broadcast(room, stateMessage(room, now));
}

function stopRoom(room: Room) {
  if (room.tickTimer) clearInterval(room.tickTimer);
  room.tickTimer = null;
  // La salle reste en mémoire un moment pour servir le dernier état aux retardataires.
  setTimeout(() => rooms.delete(room.raceId), 60_000);
}

async function setRaceStatus(room: Room, status: "racing") {
  const lobby = await db
    .selectFrom("lobbies")
    .select("status")
    .where("id", "=", room.lobbyId)
    .executeTakeFirst();
  if (lobby && lobby.status === "countdown") {
    assertTransition("countdown", "racing");
    await db.updateTable("lobbies").set({ status }).where("id", "=", room.lobbyId).execute();
  }
  await db.updateTable("races").set({ status }).where("id", "=", room.raceId).execute();
}

/** Reprise après redémarrage : avancement des humains toutes les 2 s. */
async function checkpoint(room: Room) {
  for (const r of room.engine.racers.values()) {
    if (r.isBot || r.status !== "racing") continue;
    await db
      .updateTable("race_participants")
      .set({ progress_chars: r.progress, error_count: r.errors })
      .where("id", "=", r.id)
      .execute();
  }
}

/** Enregistre les résultats (RES-02) et passe la salle à RÉSULTATS. */
async function persistResults(room: Room, now: number) {
  if (room.persisting) return;
  room.persisting = true;
  const results = room.engine.results(now);

  for (const r of results) {
    await db
      .updateTable("race_participants")
      .set({
        status: r.status === "racing" ? "timeout" : r.status,
        progress_chars: r.progress,
        error_count: r.errors,
        wpm: r.wpm,
        raw_wpm: r.rawWpm,
        accuracy: r.accuracy,
        rank: r.rank,
        text_length: r.textLength,
        finish_ms: Math.round(r.timeMs),
        penalty_ms: Math.round(r.penaltyMs),
        finished_at: new Date(room.startsAtMs + r.timeMs - r.penaltyMs),
        bonuses: JSON.stringify(r.bonuses),
        wpm_series: JSON.stringify(r.series),
        key_correct: JSON.stringify(r.keyCorrect),
        key_errors: JSON.stringify(r.keyErrors),
      })
      .where("id", "=", r.id)
      .execute();

    if (r.userId && !r.isBot) {
      await mergeKeyStats(r.userId, r.keyCorrect, r.keyErrors);
      await recomputeUserStats(r.userId);
    }
  }

  await db
    .updateTable("races")
    .set({ status: "finished", ends_at: new Date(now) })
    .where("id", "=", room.raceId)
    .execute();

  const lobby = await db
    .selectFrom("lobbies")
    .select("status")
    .where("id", "=", room.lobbyId)
    .executeTakeFirst();
  if (lobby?.status === "racing" || lobby?.status === "countdown") {
    await db
      .updateTable("lobbies")
      // Les pages de course ne signalent pas la présence en salle : on repart d'une présence
      // « fraîche » pour que l'hôte ait le temps d'arriver sur les résultats (SALLE-08).
      .set({ status: "finished", last_host_seen_at: new Date(now) })
      .where("id", "=", room.lobbyId)
      .execute();
    await db
      .updateTable("lobby_players")
      .set({ last_seen_at: new Date(now) })
      .where("lobby_id", "=", room.lobbyId)
      .where("active", "=", true)
      .execute();
  }
}

/** Charge au démarrage les courses non terminées (redémarrage du serveur). */
export async function resumeUnfinishedRaces() {
  const open = await db
    .selectFrom("races")
    .select("id")
    .where("status", "in", ["countdown", "racing"])
    .execute();
  for (const race of open) await loadRoom(race.id);
}

export async function attachRaceSocket(
  socket: WebSocket,
  identity: RealtimeIdentity,
  query: { race: string },
) {
  const room = await loadRoom(query.race);
  if (!room) {
    socket.close(1008, "course introuvable");
    return;
  }
  const member = room.members.get(identity.key);
  if (!member) {
    socket.close(4403, "pas dans cette course");
    return;
  }

  const racerId = member.racerId;
  if (racerId) {
    let set = room.sockets.get(racerId);
    if (!set) {
      set = new Set();
      room.sockets.set(racerId, set);
    }
    set.add(socket);
    room.engine.setConnected(racerId, true, Date.now());
    const racer = room.engine.racers.get(racerId)!;
    send(socket, { type: "text", text: racer.text, progress: racer.progress });
  } else {
    room.spectators.add(socket);
  }
  send(socket, stateMessage(room, Date.now()));

  const limiter = createRateLimiter(25, 1_000); // PERF-02 : au plus 25 messages par seconde (le client en envoie 10)
  socket.on("message", (raw) => {
    if (!racerId || !limiter.allow()) return;
    const m = parseMessage(raceClientMessage, raw);
    if (!m) return;
    const now = Date.now();
    if (m.type === "progress") {
      room.engine.applyProgress(
        racerId,
        {
          progressChars: m.progressChars,
          errorCount: m.errorCount,
          keyCorrect: m.keyCorrect,
          keyErrors: m.keyErrors,
        },
        now,
      );
    } else {
      dispatchEvents(room, room.engine.abandon(racerId, now));
    }
  });

  socket.on("close", () => {
    if (racerId) {
      const set = room.sockets.get(racerId);
      set?.delete(socket);
      if (!set || set.size === 0) room.engine.setConnected(racerId, false, Date.now());
    } else {
      room.spectators.delete(socket);
    }
  });
}
