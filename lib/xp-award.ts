import { sql } from "kysely";
import { db } from "@/lib/db";
import type { RacerResult } from "@/lib/race/engine";
import { abandonPenalty, raceComplexity, raceXp, wordCount } from "@/lib/xp";
import { finishRaceForUser, parseLoadout } from "@/lib/inventory-store";
import { podiumCoal } from "@/lib/items";
import { activeBoost } from "@/lib/leaderboard";

/**
 * Fin de course : XP gagnée par chaque compte (et perte d'un niveau pour un abandon volontaire).
 * Les bots et les invités n'ont pas d'XP (AUTH-03 : pas de compte, pas de progression).
 * Équipement (inventaire) : l'or et la fiole d'expérience augmentent l'XP gagnée, le totem évite la perte
 * à l'abandon ; l'armure portée s'use d'une course et le podium peut rapporter du charbon.
 * Sans dépendance à Next.js : appelé par le serveur temps réel.
 */
export async function awardRaceXp(
  raceId: string,
  results: readonly RacerResult[],
  rng: () => number = Math.random,
) {
  const race = await db
    .selectFrom("races")
    .innerJoin("lobbies", "lobbies.id", "races.lobby_id")
    .select(["races.text_content", "races.settings", "lobbies.complexity"])
    .where("races.id", "=", raceId)
    .executeTakeFirst();
  if (!race) return;
  const complexity = raceComplexity(race.settings, race.complexity);
  const words = wordCount(race.text_content);
  const loadouts = new Map(
    (
      await db
        .selectFrom("race_participants")
        .select(["id", "loadout"])
        .where("race_id", "=", raceId)
        .execute()
    ).map((row) => [row.id, parseLoadout(row.loadout)]),
  );

  for (const r of results) {
    if (r.isBot) continue;
    let gained: number | null = null;
    let coal: number | null = null;
    if (r.userId) {
      const loadout = loadouts.get(r.id) ?? parseLoadout(null);
      if (r.status === "abandoned") {
        if (r.abandonReason === "player" && !loadout.noLevelLoss) {
          const user = await db
            .selectFrom("users")
            .select("xp_total")
            .where("id", "=", r.userId)
            .executeTakeFirst();
          gained = -abandonPenalty(user?.xp_total ?? 0);
        } else {
          gained = 0; // déconnexion ou totem d'immortalité : aucune perte
        }
      } else {
        const base = raceXp({
          complexity,
          words,
          opponents: results.filter((o) => o.id !== r.id),
          status: r.status,
          rank: r.rank,
          accuracy: r.accuracy,
        });
        // Bonus d'XP du classement (prix de la semaine), s'il est encore actif.
        const boostRow = await db
          .selectFrom("users")
          .select(["xp_boost", "xp_boost_until"])
          .where("id", "=", r.userId)
          .executeTakeFirst();
        const boost = boostRow ? activeBoost(boostRow) : 0;
        gained = Math.round(base * (1 + loadout.xpBonus + boost));
      }
      await db
        .updateTable("users")
        .set({ xp_total: sql<number>`greatest(0, xp_total + ${gained})` })
        .where("id", "=", r.userId)
        .execute();
      const won = podiumCoal(r.rank, r.status === "finished", results.length - 1, rng);
      coal = await finishRaceForUser(r.userId, won, {
        podium: r.status === "finished" && r.rank <= 3,
        abandoned: r.status === "abandoned" && r.abandonReason === "player",
      });
    }
    await db
      .updateTable("race_participants")
      .set({
        xp_gained: gained,
        coal_gained: coal,
        abandon_reason: r.status === "abandoned" ? r.abandonReason : null,
      })
      .where("id", "=", r.id)
      .execute();
  }
}
