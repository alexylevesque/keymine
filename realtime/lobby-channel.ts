import { Client } from "pg";
import type { WebSocket } from "ws";
import { kysely as db } from "@/lib/db";
import { loadLobbySnapshot, viewLobby, type Viewer } from "@/lib/lobby-snapshot";
import { sweepLobbies } from "@/lib/lobby-sweep";
import type { RealtimeIdentity } from "./auth";
import { createRateLimiter, lobbyClientMessage, parseMessage } from "./protocol";

// Canal « salle d'attente » : chaque client connecté reçoit un instantané de
// la salle propre à sa personne (qui est l'hôte, qui est moi, qui est
// connecté), poussé dès qu'une notification Postgres annonce un changement.

type Member = { socket: WebSocket; identity: RealtimeIdentity };

const channels = new Map<string, Set<Member>>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();

const PRESENCE_TICK_MS = 10_000;
const SWEEP_TICK_MS = 5_000;
const DEBOUNCE_MS = 40;

function viewerOf(identity: RealtimeIdentity): Viewer {
  return identity.kind === "user"
    ? { userId: identity.userId, guestId: null }
    : { userId: null, guestId: identity.guestId };
}

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

/** Clés `u:<id>` / `g:<id>` des personnes actuellement connectées à la salle. */
export function connectedKeys(code: string): Set<string> {
  const members = channels.get(code);
  return new Set(members ? [...members].map((m) => m.identity.key) : []);
}

async function refresh(code: string) {
  const members = channels.get(code);
  if (!members || members.size === 0) return;
  const raw = await loadLobbySnapshot(code);

  if (!raw || raw.lobby.status === "closed") {
    for (const m of members) {
      send(m.socket, { type: "closed" });
      m.socket.close(1000, "salle fermée");
    }
    channels.delete(code);
    return;
  }

  const keys = connectedKeys(code);
  for (const m of [...members]) {
    const stillIn = raw.players.some((p) =>
      m.identity.kind === "user" ? p.userId === m.identity.userId : p.guestId === m.identity.guestId,
    );
    if (!stillIn) {
      send(m.socket, { type: "removed" });
      m.socket.close(1000, "retiré de la salle");
      continue;
    }
    send(m.socket, { type: "lobby", ...viewLobby(raw, viewerOf(m.identity), keys) });
  }
}

export function scheduleRefresh(code: string) {
  if (pending.has(code)) return;
  pending.set(
    code,
    setTimeout(() => {
      pending.delete(code);
      refresh(code).catch((error) => console.error("[realtime] refresh", code, error));
    }, DEBOUNCE_MS),
  );
}

async function isActiveMember(code: string, identity: RealtimeIdentity): Promise<boolean> {
  const row = await db
    .selectFrom("lobby_players")
    .innerJoin("lobbies", "lobbies.id", "lobby_players.lobby_id")
    .select("lobby_players.id")
    .where("lobbies.code", "=", code)
    .where("lobbies.status", "!=", "closed")
    .where("lobby_players.active", "=", true)
    .where((eb) =>
      identity.kind === "user"
        ? eb("lobby_players.user_id", "=", identity.userId)
        : eb("lobby_players.guest_id", "=", identity.guestId),
    )
    .executeTakeFirst();
  return !!row;
}

/** Rattache un socket authentifié à la salle `code`. Ferme avec 4403 si la personne n'en fait pas partie. */
export async function attachLobbySocket(
  socket: WebSocket,
  identity: RealtimeIdentity,
  code: string,
) {
  if (!(await isActiveMember(code, identity))) {
    socket.close(4403, "pas dans cette salle");
    return;
  }

  const member: Member = { socket, identity };
  let members = channels.get(code);
  if (!members) {
    members = new Set();
    channels.set(code, members);
  }
  members.add(member);

  const limiter = createRateLimiter(30, 10_000); // PERF-02
  socket.on("message", (raw) => {
    if (!limiter.allow()) {
      socket.close(1008, "trop de messages");
      return;
    }
    const msg = parseMessage(lobbyClientMessage, raw);
    if (!msg) return;
    if (msg.type === "ping") send(socket, { type: "pong" });
  });

  socket.on("close", () => {
    members.delete(member);
    if (members.size === 0) channels.delete(code);
    scheduleRefresh(code); // la présence a changé
  });

  scheduleRefresh(code);
  void touchPresence(code);
}

/** Marque comme vus les membres connectés (et l'hôte s'il est connecté). */
async function touchPresence(code: string) {
  const members = channels.get(code);
  if (!members || members.size === 0) return;
  const userIds = [...members].flatMap((m) => (m.identity.kind === "user" ? [m.identity.userId] : []));
  const guestIds = [...members].flatMap((m) => (m.identity.kind === "guest" ? [m.identity.guestId] : []));
  const now = new Date();

  const lobby = await db
    .selectFrom("lobbies")
    .select(["id", "host_user_id", "host_guest_id"])
    .where("code", "=", code)
    .executeTakeFirst();
  if (!lobby) return;

  await db
    .updateTable("lobby_players")
    .set({ last_seen_at: now })
    .where("lobby_id", "=", lobby.id)
    .where((eb) =>
      eb.or([
        ...(userIds.length ? [eb("user_id", "in", userIds)] : []),
        ...(guestIds.length ? [eb("guest_id", "in", guestIds)] : []),
      ]),
    )
    .execute();

  const hostHere =
    (lobby.host_user_id && userIds.includes(lobby.host_user_id)) ||
    (lobby.host_guest_id && guestIds.includes(lobby.host_guest_id));
  if (hostHere) {
    await db.updateTable("lobbies").set({ last_host_seen_at: now }).where("id", "=", lobby.id).execute();
  }
}

let listener: Client | null = null;
let onRaceCreated: (raceId: string) => void = () => {};

/** Appelé quand une course est créée (notification Postgres), même si personne n'est encore connecté. */
export function setRaceCreatedHandler(handler: (raceId: string) => void) {
  onRaceCreated = handler;
}

async function startListener() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  client.on("notification", (msg) => {
    if (msg.channel === "lobby_changed" && msg.payload) scheduleRefresh(msg.payload);
    if (msg.channel === "race_created" && msg.payload) onRaceCreated(msg.payload);
  });
  const reconnect = () => {
    if (listener !== client) return;
    listener = null;
    console.error("[realtime] écoute Postgres interrompue, reconnexion…");
    setTimeout(() => void startListener().catch(reconnect), 2_000);
  };
  client.on("error", reconnect);
  client.on("end", reconnect);
  await client.connect();
  await client.query("listen lobby_changed");
  await client.query("listen race_created");
  listener = client;
  for (const code of channels.keys()) scheduleRefresh(code); // rattrape ce qui a pu être manqué
}

/** Démarre l'écoute Postgres et les tâches périodiques (présence, balayage des hôtes absents). */
export async function startLobbyChannel() {
  await startListener().catch((error) => {
    console.error("[realtime] impossible d'écouter Postgres", error);
    process.exit(1);
  });
  setInterval(() => {
    for (const code of channels.keys()) {
      touchPresence(code).catch((e) => console.error("[realtime] présence", e));
    }
  }, PRESENCE_TICK_MS);
  setInterval(() => {
    sweepLobbies().catch((e) => console.error("[realtime] balayage", e));
  }, SWEEP_TICK_MS);
}
