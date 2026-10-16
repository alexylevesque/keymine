import type { Client } from "pg";
import type { BotLevel, Difficulty } from "@/db/types";
import { raceComplexity, raceXp, wordCount } from "@/lib/xp";

/**
 * Donne l'XP des courses jouées avant l'arrivée de l'expérience (même formule que les nouvelles
 * courses ; les anciens abandons ne coûtent rien, car le joueur n'avait pas été prévenu).
 * Idempotent : seules les lignes sans `xp_gained` sont calculées, puis l'XP totale de chaque compte
 * est recalculée comme la somme de ses courses. Lancé par `bun run db:seed` (donc à chaque déploiement).
 */
export async function backfillXp(client: Client) {
  const { rows } = await client.query<{
    id: string;
    race_id: string;
    status: "finished" | "timeout" | "abandoned" | "racing";
    rank: number | null;
    accuracy: number | null;
    complexity: Difficulty;
    settings: unknown;
    text_content: string;
  }>(
    `select rp.id, rp.race_id, rp.status, rp.rank, rp.accuracy, l.complexity, r.settings, r.text_content
       from race_participants rp join races r on r.id = rp.race_id join lobbies l on l.id = r.lobby_id
      where rp.user_id is not null and rp.is_bot = false and rp.xp_gained is null
        and rp.role = 'participant' and r.status = 'finished'`,
  );
  for (const row of rows) {
    const { rows: opponents } = await client.query<{ is_bot: boolean; bot_level: BotLevel | null }>(
      `select is_bot, bot_level from race_participants where race_id = $1 and id <> $2 and role = 'participant'`,
      [row.race_id, row.id],
    );
    const xp = raceXp({
      complexity: raceComplexity(row.settings, row.complexity),
      words: wordCount(row.text_content),
      opponents: opponents.map((o) => ({ isBot: o.is_bot, botLevel: o.bot_level })),
      status: row.status,
      rank: row.rank ?? 99,
      accuracy: Number(row.accuracy ?? 0),
    });
    await client.query(`update race_participants set xp_gained = $1 where id = $2`, [xp, row.id]);
  }
  await client.query(
    `update users u set xp_total = greatest(0, coalesce(
       (select sum(xp_gained) from race_participants rp where rp.user_id = u.id), 0))`,
  );
  return rows.length;
}
