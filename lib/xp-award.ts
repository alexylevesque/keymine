import { sql } from "kysely";
import { db } from "@/lib/db";
import type { RacerResult } from "@/lib/race/engine";
import { abandonPenalty, raceComplexity, raceXp, wordCount } from "@/lib/xp";

/**
 * Fin de course : XP gagnée par chaque compte (et perte d'un niveau pour un abandon volontaire).
 * Les bots et les invités n'ont pas d'XP (AUTH-03 : pas de compte, pas de progression).
 * Sans dépendance à Next.js : appelé par le serveur temps réel.
 */
export async function awardRaceXp(raceId: string, results: readonly RacerResult[]) {
  const race = await db
    .selectFrom("races")
    .innerJoin("lobbies", "lobbies.id", "races.lobby_id")
    .select(["races.text_content", "races.settings", "lobbies.complexity"])
    .where("races.id", "=", raceId)
    .executeTakeFirst();
  if (!race) return;
  const complexity = raceComplexity(race.settings, race.complexity);
  const words = wordCount(race.text_content);

  for (const r of results) {
    if (r.isBot) continue;
    let gained: number | null = null;
    if (r.userId) {
      if (r.status === "abandoned") {
        if (r.abandonReason === "player") {
          const user = await db.selectFrom("users").select("xp_total").where("id", "=", r.userId).executeTakeFirst();
          gained = -abandonPenalty(user?.xp_total ?? 0);
        } else {
          gained = 0; // déconnexion : aucune perte
        }
      } else {
        gained = raceXp({
          complexity,
          words,
          opponents: results.filter((o) => o.id !== r.id),
          status: r.status,
          rank: r.rank,
          accuracy: r.accuracy,
        });
      }
      await db
        .updateTable("users")
        .set({ xp_total: sql<number>`greatest(0, xp_total + ${gained})` })
        .where("id", "=", r.userId)
        .execute();
    }
    await db
      .updateTable("race_participants")
      .set({ xp_gained: gained, abandon_reason: r.status === "abandoned" ? r.abandonReason : null })
      .where("id", "=", r.id)
      .execute();
  }
}
