import { championsCached } from "@/lib/leaderboard";
import { and, asc, desc, eq, lt, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { raceParticipants, races, users } from "@/db/schema";
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
  const race = await db.query.races.findFirst({
    columns: { id: true },
    where: and(eq(races.lobby_id, lobbyId), eq(races.status, "finished")),
    orderBy: desc(races.created_at),
  });
  return race?.id ?? null;
}

export async function loadRaceResults(raceId: string): Promise<RaceResults | null> {
  const race = await db.query.races.findFirst({ where: eq(races.id, raceId) });
  if (!race) return null;

  const rp = raceParticipants;
  const rows = await db
    .select({
      id: rp.id,
      display_name: rp.display_name,
      is_bot: rp.is_bot,
      bot_level: rp.bot_level,
      user_id: rp.user_id,
      guest_id: rp.guest_id,
      role: rp.role,
      rank: rp.rank,
      status: rp.status,
      wpm: rp.wpm,
      raw_wpm: rp.raw_wpm,
      accuracy: rp.accuracy,
      error_count: rp.error_count,
      finish_ms: rp.finish_ms,
      penalty_ms: rp.penalty_ms,
      progress_chars: rp.progress_chars,
      text_length: rp.text_length,
      bonuses: rp.bonuses,
      wpm_series: rp.wpm_series,
      key_correct: rp.key_correct,
      key_errors: rp.key_errors,
      xp_gained: rp.xp_gained,
      coal_gained: rp.coal_gained,
      avatar_url: users.avatar_url,
    })
    .from(rp)
    .leftJoin(users, eq(users.id, rp.user_id))
    .where(eq(rp.race_id, raceId))
    .orderBy(asc(rp.rank));

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
  const race = await db.query.races.findFirst({
    columns: { created_at: true },
    where: eq(races.id, raceId),
  });
  if (!race) return false;
  const [previous] = await db
    .select({ best: max(raceParticipants.wpm) })
    .from(raceParticipants)
    .innerJoin(races, eq(races.id, raceParticipants.race_id))
    .where(
      and(
        eq(raceParticipants.user_id, userId),
        eq(raceParticipants.status, "finished"),
        lt(races.created_at, race.created_at),
      ),
    );
  // Une première course n'a rien à battre : pas de record.
  return previous?.best != null && wpm > previous.best;
}
