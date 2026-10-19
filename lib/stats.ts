import { sql } from "kysely";
import { kysely as db } from "@/lib/db";

/**
 * Recalcule les statistiques agrégées d'un compte (STAT-4) à partir de ses
 * courses terminées. Appelé après chaque course et après une fusion de
 * l'historique invité (AUTH-8), plutôt que de maintenir des compteurs en
 * parallèle qui pourraient diverger.
 */
export async function recomputeUserStats(userId: string) {
  const agg = await db
    .selectFrom("race_participants")
    .where("user_id", "=", userId)
    .where("status", "=", "finished")
    .where("is_bot", "=", false)
    .select((eb) => [
      eb.fn.max("wpm").as("best_wpm"),
      eb.fn.count<number>("id").as("total_races"),
      eb.fn.sum<number>("error_count").as("total_errors"),
      eb.fn.sum<number>("progress_chars").as("total_chars_typed"),
      eb.fn.max("finished_at").as("last_race_at"),
    ])
    .executeTakeFirst();

  const dayRows = await db
    .selectFrom("race_participants")
    .where("user_id", "=", userId)
    .where("status", "=", "finished")
    .select(sql<string>`distinct date_trunc('day', finished_at)`.as("day"))
    .orderBy("day", "desc")
    .execute();

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
    .updateTable("users")
    .set({
      best_wpm: agg?.best_wpm ?? 0,
      total_races: Number(agg?.total_races ?? 0),
      total_errors: Number(agg?.total_errors ?? 0),
      total_chars_typed: Number(agg?.total_chars_typed ?? 0),
      last_race_at: agg?.last_race_at ?? null,
      current_streak_days: streak,
    })
    .where("id", "=", userId)
    .execute();
}

/** Fusionne l'historique d'un invité dans un compte à la connexion (AUTH-8). */
export async function mergeGuestHistory(guestId: string, userId: string) {
  await db.transaction().execute(async (trx) => {
    // Le compte était déjà dans une salle où l'invité a joué (deux onglets) :
    // une seule ligne par personne et par salle, on garde celle du compte.
    const duplicates = await trx
      .selectFrom("lobby_players as g")
      .innerJoin("lobby_players as u", (join) =>
        join.onRef("u.lobby_id", "=", "g.lobby_id").on("u.user_id", "=", userId),
      )
      .where("g.guest_id", "=", guestId)
      .select(["g.id as guestRow", "u.id as userRow"])
      .execute();
    for (const { guestRow, userRow } of duplicates) {
      await trx
        .updateTable("race_participants")
        .set({ lobby_player_id: userRow })
        .where("lobby_player_id", "=", guestRow)
        .execute();
      await trx.deleteFrom("lobby_players").where("id", "=", guestRow).execute();
    }

    // Une seule salle active à la fois (SALLE-06) : si le compte est déjà
    // dans une salle, la place de l'invité est libérée.
    const userActive = await trx
      .selectFrom("lobby_players")
      .where("user_id", "=", userId)
      .where("active", "=", true)
      .select("id")
      .executeTakeFirst();
    if (userActive) {
      await trx
        .updateTable("lobby_players")
        .set({ active: false })
        .where("guest_id", "=", guestId)
        .execute();
    }

    await trx
      .updateTable("lobby_players")
      .set({ user_id: userId, guest_id: null })
      .where("guest_id", "=", guestId)
      .execute();

    await trx
      .updateTable("race_participants")
      .set({ user_id: userId, guest_id: null })
      .where("guest_id", "=", guestId)
      .execute();
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
      .insertInto("key_stats")
      .values({ user_id: userId, char, correct_count: correct, error_count: errors })
      .onConflict((oc) =>
        oc.columns(["user_id", "char"]).doUpdateSet({
          correct_count: sql`key_stats.correct_count + excluded.correct_count`,
          error_count: sql`key_stats.error_count + excluded.error_count`,
        }),
      )
      .execute();
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
  const row = await db
    .selectFrom("race_participants")
    .where("user_id", "=", userId)
    .where("status", "=", "finished")
    .where("role", "=", "participant")
    .select((eb) => [
      eb.fn.max("wpm").as("best_wpm"),
      eb.fn.avg<string>("wpm").as("avg_wpm"),
      eb.fn.avg<string>("accuracy").as("avg_accuracy"),
      eb.fn.countAll<string>().as("races"),
      sql<string>`count(*) filter (where rank = 1)`.as("wins"),
    ])
    .executeTakeFirst();
  return {
    bestWpm: row?.best_wpm ?? 0,
    avgWpm: row?.avg_wpm != null ? Number(row.avg_wpm) : null,
    avgAccuracy: row?.avg_accuracy != null ? Number(row.avg_accuracy) : null,
    races: Number(row?.races ?? 0),
    wins: Number(row?.wins ?? 0),
  };
}
