import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbies, raceParticipants, races, users } from "@/db/schema";
import { raceComplexity, raceXp, wordCount } from "@/lib/xp";

/**
 * Donne l'XP des courses jouées avant l'arrivée de l'expérience (même formule que les nouvelles
 * courses ; les anciens abandons ne coûtent rien, car le joueur n'avait pas été prévenu).
 * Idempotent : seules les lignes sans `xp_gained` sont calculées, et leur XP s'AJOUTE à celle du compte.
 * On ne recalcule jamais l'XP totale comme la somme des courses : elle bouge aussi hors des courses
 * (boutique, enchantement, objets jetés, prix du classement). Lancé par `bun run db:seed`, donc à
 * chaque déploiement.
 */
export async function backfillXp() {
  const rp = raceParticipants;
  const rows = await db
    .select({
      id: rp.id,
      race_id: rp.race_id,
      user_id: rp.user_id,
      status: rp.status,
      rank: rp.rank,
      accuracy: rp.accuracy,
      complexity: lobbies.complexity,
      settings: races.settings,
      text_content: races.text_content,
    })
    .from(rp)
    .innerJoin(races, eq(races.id, rp.race_id))
    .innerJoin(lobbies, eq(lobbies.id, races.lobby_id))
    .where(
      and(
        sql`${rp.user_id} is not null`,
        eq(rp.is_bot, false),
        isNull(rp.xp_gained),
        eq(rp.role, "participant"),
        eq(races.status, "finished"),
      ),
    );
  for (const row of rows) {
    const opponents = await db
      .select({ isBot: rp.is_bot, botLevel: rp.bot_level })
      .from(rp)
      .where(and(eq(rp.race_id, row.race_id), ne(rp.id, row.id), eq(rp.role, "participant")));
    const xp = raceXp({
      complexity: raceComplexity(row.settings, row.complexity),
      words: wordCount(row.text_content),
      opponents,
      status: row.status,
      rank: row.rank ?? 99,
      accuracy: Number(row.accuracy ?? 0),
    });
    await db.update(rp).set({ xp_gained: xp }).where(eq(rp.id, row.id));
    if (row.user_id) {
      await db
        .update(users)
        .set({ xp_total: sql`greatest(0, ${users.xp_total} + ${xp})` })
        .where(eq(users.id, row.user_id));
    }
  }
  return rows.length;
}
