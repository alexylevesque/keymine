import { championsCached } from "@/lib/leaderboard";
import { kysely as db } from "@/lib/db";
import type { BonusRecord } from "@/lib/race/bonus";
import type { ParticipantStatus } from "@/db/types";

// Chargement des résultats d'une course terminée (RES-01 à RES-05, HIST-02).

export type ResultRow = {
  id: string;
  name: string;
  isBot: boolean;
  botLevel: string | null;
  userId: string | null;
  /** Clé d'identité (u:<id> compte, g:<id> invité) ; null pour un bot. */
  ownerKey: string | null;
  rank: number;
  status: ParticipantStatus;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  errors: number;
  /** Temps classé : temps réel + pénalité d'erreurs. */
  timeMs: number;
  /** Part de `timeMs` due aux erreurs non corrigées. */
  penaltyMs: number;
  progress: number;
  textLength: number;
  bonuses: BonusRecord[];
  /** Un point par seconde : `t` en secondes depuis le départ, `wpm` = MPM moyen depuis le départ. */
  series: { t: number; wpm: number }[];
  keyCorrect: Record<string, number>;
  keyErrors: Record<string, number>;
  avatarUrl: string | null;
  /** XP gagnée (négative : abandon volontaire) ; null pour les bots et les invités. */
  xp: number | null;
  /** Charbon gagné au podium (inventaire) ; null pour les bots et les invités. */
  coal: number | null;
  /** Classe du champion de la semaine passée (couronne), sinon null. */
  champion: number | null;
};

export type RaceResults = {
  race: {
    id: string;
    lobbyId: string;
    status: string;
    language: string;
    createdAt: Date;
    textLength: number;
    durationSeconds: number;
  };
  rows: ResultRow[];
  spectatorKeys: string[];
};

export async function latestFinishedRaceId(lobbyId: string): Promise<string | null> {
  const race = await db
    .selectFrom("races")
    .select("id")
    .where("lobby_id", "=", lobbyId)
    .where("status", "=", "finished")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return race?.id ?? null;
}

export async function loadRaceResults(raceId: string): Promise<RaceResults | null> {
  const race = await db.selectFrom("races").selectAll().where("id", "=", raceId).executeTakeFirst();
  if (!race) return null;

  const rows = await db
    .selectFrom("race_participants")
    .leftJoin("users", "users.id", "race_participants.user_id")
    .select([
      "race_participants.id",
      "race_participants.display_name",
      "race_participants.is_bot",
      "race_participants.bot_level",
      "race_participants.user_id",
      "race_participants.guest_id",
      "race_participants.role",
      "race_participants.rank",
      "race_participants.status",
      "race_participants.wpm",
      "race_participants.raw_wpm",
      "race_participants.accuracy",
      "race_participants.error_count",
      "race_participants.finish_ms",
      "race_participants.penalty_ms",
      "race_participants.progress_chars",
      "race_participants.text_length",
      "race_participants.bonuses",
      "race_participants.wpm_series",
      "race_participants.key_correct",
      "race_participants.key_errors",
      "race_participants.xp_gained",
      "race_participants.coal_gained",
      "users.avatar_url",
    ])
    .where("race_participants.race_id", "=", raceId)
    .orderBy("race_participants.rank", "asc")
    .execute();

  const participants = rows.filter((r) => r.role === "participant");
  const champions = await championsCached().catch(() => new Map<string, number>());
  return {
    race: {
      id: race.id,
      lobbyId: race.lobby_id,
      status: race.status,
      language: race.language,
      createdAt: new Date(race.created_at),
      textLength: race.text_content.length,
      durationSeconds: race.duration_seconds,
    },
    rows: participants.map((r) => ({
      id: r.id,
      name: r.display_name,
      isBot: r.is_bot,
      botLevel: r.bot_level,
      userId: r.user_id,
      ownerKey: r.user_id ? `u:${r.user_id}` : r.guest_id ? `g:${r.guest_id}` : null,
      rank: r.rank ?? participants.length,
      status: r.status,
      wpm: r.wpm ?? 0,
      rawWpm: r.raw_wpm ?? r.wpm ?? 0,
      accuracy: r.accuracy ?? 100,
      errors: r.error_count,
      timeMs: r.finish_ms ?? 0,
      penaltyMs: r.penalty_ms,
      progress: r.progress_chars,
      textLength: r.text_length ?? race.text_content.length,
      bonuses: (r.bonuses as BonusRecord[] | null) ?? [],
      series: (r.wpm_series as { t: number; wpm: number }[] | null) ?? [],
      keyCorrect: (r.key_correct as Record<string, number> | null) ?? {},
      keyErrors: (r.key_errors as Record<string, number> | null) ?? {},
      avatarUrl: r.avatar_url,
      xp: r.xp_gained,
      coal: r.coal_gained,
      champion: r.user_id ? (champions.get(r.user_id) ?? null) : null,
    })),
    spectatorKeys: rows
      .filter((r) => r.role === "spectator")
      .map((r) => (r.user_id ? `u:${r.user_id}` : `g:${r.guest_id}`)),
  };
}

/** RES-04 : le MPM de cette course dépasse-t-il tous les MPM de ses courses terminées précédentes ? */
export async function isPersonalRecord(
  userId: string,
  raceId: string,
  wpm: number,
): Promise<boolean> {
  const race = await db
    .selectFrom("races")
    .select("created_at")
    .where("id", "=", raceId)
    .executeTakeFirst();
  if (!race) return false;
  const previous = await db
    .selectFrom("race_participants")
    .innerJoin("races", "races.id", "race_participants.race_id")
    .select((eb) => eb.fn.max("race_participants.wpm").as("best"))
    .where("race_participants.user_id", "=", userId)
    .where("race_participants.status", "=", "finished")
    .where("races.created_at", "<", race.created_at)
    .executeTakeFirst();
  // Une première course n'a rien à battre : pas de record.
  return previous?.best != null && wpm > previous.best;
}
