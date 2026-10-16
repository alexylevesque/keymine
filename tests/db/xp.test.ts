import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import type { RacerResult } from "@/lib/race/engine";
import { awardRaceXp } from "@/lib/xp-award";
import { backfillXp } from "@/db/xp-backfill";
import { raceXp, totalXpForLevel } from "@/lib/xp";

// Expérience : XP à la fin de la course, perte d'un niveau pour un abandon volontaire, rien pour
// une déconnexion, ni pour les bots et invités ; reprise de l'historique par le seed.
const client = new Client({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

const suffix = () => Math.random().toString(36).slice(2, 8);
const TEXT = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(" ");

async function user(xp: number) {
  const name = `xp_${suffix()}`;
  const { rows } = await client.query<{ id: string }>(
    `insert into users (username, password_hash, display_name, xp_total) values ($1, 'x', $1, $2) returning id`,
    [name, xp],
  );
  return rows[0]!.id;
}

async function race(complexity: "easy" | "medium" | "hard") {
  const host = await user(0);
  const { rows: l } = await client.query<{ id: string }>(
    `insert into lobbies (code, host_user_id, name, complexity) values ($1, $2, 'xp', $3) returning id`,
    [`X${suffix().toUpperCase().slice(0, 5)}`, host, complexity],
  );
  const { rows } = await client.query<{ id: string }>(
    `insert into races (lobby_id, text_content, language, status, starts_at, duration_seconds, settings)
     values ($1, $2, 'fr', 'finished', now(), 60, $3) returning id`,
    [l[0]!.id, TEXT, JSON.stringify({ complexity })],
  );
  return rows[0]!.id;
}

async function participant(raceId: string, p: Partial<RacerResult>) {
  const { rows } = await client.query<{ id: string }>(
    `insert into race_participants (race_id, user_id, guest_id, display_name, is_bot, bot_level, status, rank, accuracy)
     values ($1, $2, $3, 'p', $4, $5, $6, $7, $8) returning id`,
    [
      raceId,
      p.userId ?? null,
      p.guestId ?? null,
      p.isBot ?? false,
      p.botLevel ?? null,
      p.status,
      p.rank,
      p.accuracy,
    ],
  );
  return { ...p, id: rows[0]!.id } as RacerResult;
}

async function xpOf(userId: string) {
  const { rows } = await client.query<{ xp_total: number }>(
    `select xp_total from users where id = $1`,
    [userId],
  );
  return rows[0]!.xp_total;
}

describe("expérience en fin de course", () => {
  it("donne l'XP du tableau, enlève un niveau à l'abandon volontaire, rien à la déconnexion", async () => {
    const raceId = await race("hard");
    const winner = await user(0);
    const quitter = await user(totalXpForLevel(10) + 13);
    const dropped = await user(500);
    const results = [
      await participant(raceId, {
        userId: winner,
        status: "finished",
        rank: 1,
        accuracy: 100,
        abandonReason: null,
      }),
      await participant(raceId, {
        isBot: true,
        botLevel: "impossible",
        status: "finished",
        rank: 2,
        accuracy: 99,
        abandonReason: null,
      }),
      await participant(raceId, {
        guestId: `g-${suffix()}`,
        status: "finished",
        rank: 3,
        accuracy: 90,
        abandonReason: null,
      }),
      await participant(raceId, {
        userId: quitter,
        status: "abandoned",
        rank: 4,
        accuracy: 80,
        abandonReason: "player",
      }),
      await participant(raceId, {
        userId: dropped,
        status: "abandoned",
        rank: 5,
        accuracy: 80,
        abandonReason: "disconnected",
      }),
    ];

    await awardRaceXp(raceId, results);

    // 4 adversaires : impossible (3) + invité (2) + 2 comptes (2 + 2) = 9 → ×1,9 ; difficile ×2 ; 1er ×2 ; 100 % +10.
    const expected = raceXp({
      complexity: "hard",
      words: 40,
      opponents: results.slice(1),
      status: "finished",
      rank: 1,
      accuracy: 100,
    });
    expect(expected).toBe(Math.round(10 * 2 * 1 * 1.9 * 2) + 10);
    expect(await xpOf(winner)).toBe(expected);
    expect(await xpOf(quitter)).toBe(totalXpForLevel(9) + 12); // niveau 9, même pourcentage (13/27 ≈ 12/25)
    expect(await xpOf(dropped)).toBe(500);

    const { rows } = await client.query<{
      xp_gained: number | null;
      abandon_reason: string | null;
    }>(`select xp_gained, abandon_reason from race_participants where race_id = $1 order by rank`, [
      raceId,
    ]);
    expect(rows.map((r) => r.xp_gained)).toEqual([
      expected,
      null,
      null,
      -(totalXpForLevel(10) + 13 - totalXpForLevel(9) - 12),
      0,
    ]);
    expect(rows.map((r) => r.abandon_reason)).toEqual([null, null, null, "player", "disconnected"]);
  });

  it("le seed reprend l'historique une seule fois (anciens abandons : sans perte)", async () => {
    const raceId = await race("easy");
    const old = await user(0);
    await participant(raceId, { userId: old, status: "finished", rank: 1, accuracy: 96 });
    await participant(raceId, {
      isBot: true,
      botLevel: "noob",
      status: "finished",
      rank: 2,
      accuracy: 90,
    });
    await backfillXp(client);
    expect(await xpOf(old)).toBe(26); // exemple du tableau
    await backfillXp(client);
    expect(await xpOf(old)).toBe(26);
  });

  it("un nouveau seed ne rend pas l'XP dépensée ailleurs (boutique, enchantement)", async () => {
    const raceId = await race("easy");
    const buyer = await user(0);
    await participant(raceId, { userId: buyer, status: "finished", rank: 1, accuracy: 96 });
    await participant(raceId, {
      isBot: true,
      botLevel: "noob",
      status: "finished",
      rank: 2,
      accuracy: 90,
    });
    await backfillXp(client);
    expect(await xpOf(buyer)).toBe(26);
    await client.query(`update users set xp_total = xp_total - 20 where id = $1`, [buyer]); // achat
    await backfillXp(client); // déploiement suivant
    expect(await xpOf(buyer)).toBe(6);
  });
});
