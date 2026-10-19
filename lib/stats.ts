import { and, avg, count, desc, eq, max, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { keyStats, lobbyPlayers, raceParticipants, users } from "@/db/schema";

/**
 * Recalcule les statistiques agrégées d'un compte (STAT-4) à partir de ses
 * courses terminées. Appelé après chaque course et après une fusion de
 * l'historique invité (AUTH-8), plutôt que de maintenir des compteurs en
 * parallèle qui pourraient diverger.
 */
export async function recomputeUserStats(userId: string) {
  const rp = raceParticipants;
  const [agg] = await db
    .select({
      best_wpm: max(rp.wpm),
      total_races: count(rp.id),
      total_errors: sum(rp.error_count),
      total_chars_typed: sum(rp.progress_chars),
      last_race_at: max(rp.finished_at),
    })
    .from(rp)
    .where(and(eq(rp.user_id, userId), eq(rp.status, "finished"), eq(rp.is_bot, false)));

  const day = sql<Date>`date_trunc('day', ${rp.finished_at})`.mapWith(rp.finished_at);
  const dayRows = await db
    .selectDistinct({ day })
    .from(rp)
    .where(and(eq(rp.user_id, userId), eq(rp.status, "finished")))
    .orderBy(desc(day));

  let streak = 0;
  if (dayRows.length > 0) {
    let cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    for (const row of dayRows) {
      const day = new Date(row.day);
      const diffDays = Math.round((cursor.getTime() - day.getTime()) / 86_400_000);
      if (diffDays === 0 || diffDays === 1) {
        streak += 1;
        cursor = day;
      } else {
        break;
      }
    }
  }

  await db
    .update(users)
    .set({
      best_wpm: agg?.best_wpm ?? 0,
      total_races: Number(agg?.total_races ?? 0),
      total_errors: Number(agg?.total_errors ?? 0),
      total_chars_typed: Number(agg?.total_chars_typed ?? 0),
      last_race_at: agg?.last_race_at ?? null,
      current_streak_days: streak,
    })
    .where(eq(users.id, userId));
}

/** Fusionne l'historique d'un invité dans un compte à la connexion (AUTH-8). */
export async function mergeGuestHistory(guestId: string, userId: string) {
  await db.transaction(async (tx) => {
    // Le compte était déjà dans une salle où l'invité a joué (deux onglets) :
    // une seule ligne par personne et par salle, on garde celle du compte.
    const g = alias(lobbyPlayers, "g");
    const u = alias(lobbyPlayers, "u");
    const duplicates = await tx
      .select({ guestRow: g.id, userRow: u.id })
      .from(g)
      .innerJoin(u, and(eq(u.lobby_id, g.lobby_id), eq(u.user_id, userId)))
      .where(eq(g.guest_id, guestId));
    for (const { guestRow, userRow } of duplicates) {
      await tx
        .update(raceParticipants)
        .set({ lobby_player_id: userRow })
        .where(eq(raceParticipants.lobby_player_id, guestRow));
      await tx.delete(lobbyPlayers).where(eq(lobbyPlayers.id, guestRow));
    }

    // Une seule salle active à la fois (SALLE-06) : si le compte est déjà
    // dans une salle, la place de l'invité est libérée.
    const [userActive] = await tx
      .select({ id: lobbyPlayers.id })
      .from(lobbyPlayers)
      .where(and(eq(lobbyPlayers.user_id, userId), eq(lobbyPlayers.active, true)))
      .limit(1);
    if (userActive) {
      await tx
        .update(lobbyPlayers)
        .set({ active: false })
        .where(eq(lobbyPlayers.guest_id, guestId));
    }

    await tx
      .update(lobbyPlayers)
      .set({ user_id: userId, guest_id: null })
      .where(eq(lobbyPlayers.guest_id, guestId));

    await tx
      .update(raceParticipants)
      .set({ user_id: userId, guest_id: null })
      .where(eq(raceParticipants.guest_id, guestId));
  });

  await recomputeUserStats(userId);
}

/** Ajoute les compteurs de touches d'une course à la heatmap globale du compte. */
export async function mergeKeyStats(
  userId: string,
  keyCorrect: Record<string, number>,
  keyErrors: Record<string, number>,
) {
  const chars = new Set([...Object.keys(keyCorrect), ...Object.keys(keyErrors)]);
  for (const char of chars) {
    const correct = keyCorrect[char] ?? 0;
    const errors = keyErrors[char] ?? 0;
    if (correct === 0 && errors === 0) continue;

    await db
      .insert(keyStats)
      .values({ user_id: userId, char, correct_count: correct, error_count: errors })
      .onConflictDoUpdate({
        target: [keyStats.user_id, keyStats.char],
        set: {
          correct_count: sql`${keyStats.correct_count} + excluded.correct_count`,
          error_count: sql`${keyStats.error_count} + excluded.error_count`,
        },
      });
  }
}

export type ProfileStats = {
  bestWpm: number;
  avgWpm: number | null;
  avgAccuracy: number | null;
  races: number;
  wins: number;
};

/**
 * AUTH-06 : statistiques du profil. Une victoire = première place dans une course
 * terminée à laquelle on a réellement participé (les abandons ne comptent pas).
 */
export async function loadProfileStats(userId: string): Promise<ProfileStats> {
  const rp = raceParticipants;
  const [row] = await db
    .select({
      best_wpm: max(rp.wpm),
      avg_wpm: avg(rp.wpm),
      avg_accuracy: avg(rp.accuracy),
      races: count(),
      wins: sql<number>`(count(*) filter (where ${rp.rank} = 1))::int`,
    })
    .from(rp)
    .where(and(eq(rp.user_id, userId), eq(rp.status, "finished"), eq(rp.role, "participant")));
  return {
    bestWpm: row?.best_wpm ?? 0,
    avgWpm: row?.avg_wpm != null ? Number(row.avg_wpm) : null,
    avgAccuracy: row?.avg_accuracy != null ? Number(row.avg_accuracy) : null,
    races: Number(row?.races ?? 0),
    wins: Number(row?.wins ?? 0),
  };
}
