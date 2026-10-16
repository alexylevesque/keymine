import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  claimReward,
  currentChampions,
  lastMove,
  loadBoard,
  loadWeek,
  pendingRewards,
  settleLastWeek,
} from "@/lib/leaderboard";
import { readInventory } from "@/lib/inventory-store";

// Classement et classes (fonctionnalité ajoutée), contre une vraie base. Chaque test utilise sa propre
// semaine (années différentes) pour ne pas voir les courses des autres tests.
const client = new Client({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

const suffix = () => Math.random().toString(36).slice(2, 8);

/** Une semaine au hasard (après 2040) : chaque exécution a ses propres semaines, même sur une base réutilisée. */
function randomWeek() {
  const monday = Date.UTC(2040, 0, 2) + Math.floor(Math.random() * 15_000) * 7 * 86_400_000; // 2 janv. 2040 : lundi
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    monday: iso(monday).slice(0, 10),
    at: iso(monday + 86_400_000 + 15 * 3_600_000), // mardi 15 h UTC
    after: new Date(monday + 8 * 86_400_000 + 12 * 3_600_000), // mardi suivant
  };
}

async function user(league = 0, xp = 0) {
  const name = `lb_${suffix()}`;
  const { rows } = await client.query<{ id: string }>(
    `insert into users (username, password_hash, display_name, league, xp_total) values ($1, 'x', $1, $2, $3) returning id`,
    [name, league, xp],
  );
  return rows[0]!.id;
}

let lobbyId: string;
beforeAll(async () => {
  const host = await user();
  const { rows } = await client.query<{ id: string }>(
    `insert into lobbies (code, host_user_id, name) values ($1, $2, 'lb') returning id`,
    [`L${suffix().toUpperCase().slice(0, 5)}`, host],
  );
  lobbyId = rows[0]!.id;
});

/** Course finie à une date donnée : `players` dans l'ordre d'arrivée ; `bot` ajoute un bot dernier. */
async function race(at: string, players: { id: string; wpm: number }[], bot = true) {
  const { rows } = await client.query<{ id: string }>(
    `insert into races (lobby_id, text_content, language, status, starts_at, duration_seconds, created_at)
     values ($1, 'a b', 'fr', 'finished', $2, 60, $2) returning id`,
    [lobbyId, at],
  );
  const raceId = rows[0]!.id;
  for (const [i, p] of players.entries()) {
    await client.query(
      `insert into race_participants (race_id, user_id, display_name, status, rank, wpm, finished_at)
       values ($1, $2, 'p', 'finished', $3, $4, $5)`,
      [raceId, p.id, i + 1, p.wpm, at],
    );
  }
  if (bot) {
    await client.query(
      `insert into race_participants (race_id, display_name, is_bot, bot_level, status, rank, wpm, finished_at)
       values ($1, 'Bot', true, 'noob', 'finished', $2, 10, $3)`,
      [raceId, players.length + 1, at],
    );
  }
}

describe("classement de la semaine et classes", () => {
  it("compte les victoires contre au moins un adversaire (un bot compte), pas les courses seul", async () => {
    const a = await user();
    const b = await user();
    const { monday, at } = randomWeek();
    for (let i = 0; i < 4; i++) await race(at, [{ id: a, wpm: 50 + i }]);
    await race(
      at,
      [
        { id: b, wpm: 90 },
        { id: a, wpm: 40 },
      ],
      false,
    );
    await race(at, [{ id: b, wpm: 95 }], false); // seul : ne compte pas

    const week = await loadWeek(monday, 0);
    const mine = week.filter((r) => r.userId === a || r.userId === b);
    expect(mine.map((r) => [r.userId, r.wins, r.races])).toEqual([
      [a, 4, 5],
      [b, 1, 2],
    ]);
    expect(mine[1]!.bestWpm).toBe(90);
  });

  it("fin de semaine : prix de la classe, montée, prix du MPM, une seule fois ; puis on récupère", async () => {
    const a = await user();
    const b = await user();
    const c = await user();
    const { at, after: now } = randomWeek();
    for (let i = 0; i < 3; i++)
      await race(
        at,
        [
          { id: a, wpm: 60 },
          { id: b, wpm: 50 },
        ],
        false,
      );
    await race(
      at,
      [
        { id: c, wpm: 120 },
        { id: b, wpm: 30 },
      ],
      false,
    );

    await settleLastWeek(now);
    await settleLastWeek(now); // idempotent

    const rewards = await pendingRewards(a);
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({ kind: "wins", rank: 1, league: 0, xp: 150, boost: 0.15 });
    expect(await lastMove(a, now)).toEqual({ from: 0, to: 1, position: 1 }); // 3 actifs : le 1er monte
    expect(await lastMove(b, now)).toEqual({ from: 0, to: 0, position: 3 });
    const champions = await currentChampions(now);
    expect(champions.get(a)).toBe(0);
    expect((await pendingRewards(c)).map((r) => r.kind)).toEqual(["wpm"]); // 120 MPM, une seule victoire

    await claimReward(a, rewards[0]!.id, now);
    const inv = await readInventory(a, now);
    expect(inv.inventory.bag[0]).toMatchObject({ item: "iron_ingot", count: 4 });
    expect(inv.xp).toBe(150);
    const { rows } = await client.query(
      `select xp_boost, xp_boost_until from users where id = $1`,
      [a],
    );
    expect(rows[0].xp_boost).toBeCloseTo(0.15);
    expect(new Date(rows[0].xp_boost_until).getTime()).toBe(now.getTime() + 7 * 86_400_000);
    await expect(claimReward(a, rewards[0]!.id, now)).rejects.toMatchObject({
      code: "reward_unknown",
    });
  });

  it("un sac plein ne fait rien perdre : la récompense attend", async () => {
    const a = await user();
    for (let i = 0; i < 27; i++) {
      await client.query(
        `insert into inventory_items (user_id, area, slot, item, count, durability) values ($1, 'bag', $2, 'iron_boots', 1, 50)`,
        [a, i],
      );
    }
    const { at, after: now } = randomWeek();
    for (let i = 0; i < 3; i++) await race(at, [{ id: a, wpm: 60 }]);
    await settleLastWeek(now);
    const reward = (await pendingRewards(a)).find((r) => r.kind === "wins");
    await expect(claimReward(a, reward!.id, now)).rejects.toMatchObject({ code: "inventory_full" });
    expect((await pendingRewards(a)).map((r) => r.kind).sort()).toEqual(["wins", "wpm"]);
    const { rows } = await client.query(`select xp_total from users where id = $1`, [a]);
    expect(rows[0].xp_total).toBe(0);
  });

  it("5 joueurs actifs : les 2 premiers montent (avec 3 victoires), le dernier descend", async () => {
    const players = [await user(2), await user(2), await user(2), await user(2), await user(2)];
    const { at, after: now } = randomWeek();
    for (const [i, p] of players.entries()) {
      for (let w = 0; w < 5 - i; w++) await race(at, [{ id: p, wpm: 50 }]);
    }
    await race(
      at,
      [
        { id: players[0]!, wpm: 50 },
        { id: players[4]!, wpm: 10 },
      ],
      false,
    );
    await settleLastWeek(now);
    const leagues = await Promise.all(
      players.map(
        async (p) =>
          (await client.query(`select league from users where id = $1`, [p])).rows[0].league,
      ),
    );
    expect(leagues).toEqual([3, 3, 2, 2, 1]);
  });
});

describe("classement général", () => {
  it("trie par niveau, MPM ou victoires, et montre toujours ma ligne", async () => {
    const top = await user(0, 1_000_000_000 + (Date.now() % 1_000_000_000)); // plus haut à chaque exécution
    const me = await user(0, 1);
    const level = await loadBoard("level", me);
    expect(level[0]!.userId).toBe(top);
    expect(level.some((r) => r.userId === me)).toBe(true);
    for (let i = 1; i < level.length; i++) {
      if (level[i]!.position <= 50) expect(level[i]!.xp).toBeLessThanOrEqual(level[i - 1]!.xp);
    }
    const wins = await loadBoard("wins", null);
    for (const r of wins) expect(r.wins).toBeGreaterThan(0);
  });
});
