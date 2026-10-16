import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { db } from "@/lib/db";
import {
  activateItem,
  buyOffer,
  craftInInventory,
  deactivateItem,
  discardItem,
  enchantItem,
  finishRaceForUser,
  moveInInventory,
  readInventory,
  readShop,
  snapshotLoadouts,
} from "@/lib/inventory-store";
import { InventoryError, SMELT_MS } from "@/lib/inventory";
import { rollEnchants } from "@/lib/enchants";
import { levelFromXp, totalXpForLevel } from "@/lib/xp";
import type { RacerResult } from "@/lib/race/engine";
import { generateOffers, shopDay } from "@/lib/shop";
import { awardRaceXp } from "@/lib/xp-award";
import { raceXp } from "@/lib/xp";

// Inventaire, boutique, four et effets en course (fonctionnalité ajoutée), contre une vraie base.
const client = new Client({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

const suffix = () => Math.random().toString(36).slice(2, 8);
const NOW = new Date("2026-10-16T15:00:00Z");

async function user(xp = 0) {
  const name = `inv_${suffix()}`;
  const { rows } = await client.query<{ id: string }>(
    `insert into users (username, password_hash, display_name, xp_total) values ($1, 'x', $1, $2) returning id`,
    [name, xp],
  );
  return rows[0]!.id;
}

async function put(
  userId: string,
  area: string,
  slot: number,
  item: string,
  count = 1,
  durability: number | null = null,
) {
  await client.query(
    `insert into inventory_items (user_id, area, slot, item, count, durability) values ($1, $2, $3, $4, $5, $6)`,
    [userId, area, slot, item, count, durability],
  );
}

async function xpOf(userId: string) {
  const { rows } = await client.query<{ xp_total: number }>(
    `select xp_total from users where id = $1`,
    [userId],
  );
  return rows[0]!.xp_total;
}

describe("boutique", () => {
  it("tire les 6 offres du jour une seule fois et les garde toute la journée", async () => {
    const u = await user();
    const first = await readShop(u, NOW);
    expect(first.offers.map(({ bought, ...o }) => (expect(bought).toBe(0), o))).toEqual(
      generateOffers(u, shopDay(NOW)),
    );
    expect(first.resetsAt).toBe(new Date("2026-10-17T04:00:00Z").getTime());
    const later = await readShop(u, new Date("2026-10-17T03:59:00Z"));
    expect(later.offers).toEqual(first.offers);
    const tomorrow = await readShop(u, new Date("2026-10-17T04:00:00Z"));
    expect(tomorrow.offers).not.toEqual(first.offers);
  });

  it("achète en XP (le niveau peut baisser), range dans le sac, respecte le stock", async () => {
    const u = await user(10_000);
    const offer = (await readShop(u, NOW)).offers[0]!;
    let view = await buyOffer(u, 0, NOW);
    expect(view.xp).toBe(10_000 - offer.price);
    expect(view.offers[0]!.bought).toBe(1);
    const inv = await readInventory(u, NOW);
    expect(inv.inventory.bag.find((s) => s?.item === offer.item)?.count).toBe(offer.count);

    for (let i = 1; i < offer.stock; i++) view = await buyOffer(u, 0, NOW);
    await expect(buyOffer(u, 0, NOW)).rejects.toMatchObject({ code: "sold_out" });
    expect(await xpOf(u)).toBe(10_000 - offer.price * offer.stock);
  });

  it("refuse sans assez d'XP, ou avec un sac plein, sans rien prendre", async () => {
    const poor = await user(1);
    await expect(buyOffer(poor, 0, NOW)).rejects.toMatchObject({ code: "not_enough_xp" });
    expect(await xpOf(poor)).toBe(1);

    const full = await user(10_000);
    for (let i = 0; i < 27; i++) await put(full, "bag", i, "iron_boots", 1, 50);
    await expect(buyOffer(full, 0, NOW)).rejects.toMatchObject({ code: "inventory_full" });
    expect(await xpOf(full)).toBe(10_000);
    await expect(buyOffer(full, 9, NOW)).rejects.toThrow(); // case inexistante (aussi refusée par Zod)
  });
});

describe("inventaire", () => {
  it("déplace, fabrique une pièce sur la table 3 × 3 et l'équipe", async () => {
    const u = await user();
    await put(u, "bag", 0, "iron_ingot", 5);
    for (const slot of [0, 1, 2, 3, 5]) {
      await moveInInventory(u, { area: "bag", slot: 0 }, { area: "craft", slot }, 1, NOW);
    }
    const { view, result } = await craftInInventory(u, NOW);
    expect(result).toEqual({ item: "iron_helmet", count: 1, durability: 50 });
    expect(view.inventory.craft.every((s) => s === null)).toBe(true);
    const slot = view.inventory.bag.findIndex((s) => s?.item === "iron_helmet");
    const equipped = await moveInInventory(
      u,
      { area: "bag", slot },
      { area: "bag", slot: -1 },
      undefined,
      NOW,
    );
    expect(equipped.inventory.armor[0]).toMatchObject({ item: "iron_helmet", durability: 50 });
  });

  it("refuse un déplacement interdit sans rien changer", async () => {
    const u = await user();
    await put(u, "bag", 0, "leather", 3);
    await expect(
      moveInInventory(u, { area: "bag", slot: 0 }, { area: "armor", slot: 0 }, undefined, NOW),
    ).rejects.toBeInstanceOf(InventoryError);
    expect((await readInventory(u, NOW)).inventory.bag[0]).toMatchObject({
      item: "leather",
      count: 3,
    });
  });

  it("jeter détruit les objets et rend 25 % de leur valeur en XP", async () => {
    const u = await user(100);
    await put(u, "bag", 0, "diamond", 3);
    await put(u, "armor", 1, "diamond_chestplate", 1, 50);
    const { view, result } = await discardItem(u, { area: "bag", slot: 0 }, 2, NOW);
    expect(result).toEqual({ item: "diamond", count: 2, xp: 30 });
    expect(view.inventory.bag[0]?.count).toBe(1);
    expect(view.xp).toBe(130);
    const worn = await discardItem(u, { area: "armor", slot: 1 }, undefined, NOW);
    expect(worn.result.xp).toBe(60); // à moitié usé : la moitié de 25 % de 480
    expect(worn.view.inventory.armor[1]).toBeNull();
    await expect(discardItem(u, { area: "bag", slot: 5 }, undefined, NOW)).rejects.toMatchObject({
      code: "empty_slot",
    });
  });

  it("le four continue de cuire entre deux visites", async () => {
    const u = await user();
    await put(u, "bag", 0, "gold_ore", 3);
    await put(u, "bag", 1, "coal", 1);
    await moveInInventory(u, { area: "bag", slot: 0 }, { area: "bag", slot: -1 }, undefined, NOW);
    const started = await moveInInventory(
      u,
      { area: "bag", slot: 1 },
      { area: "bag", slot: -1 },
      undefined,
      NOW,
    );
    expect(started.furnaceActive).toBe(true);

    const later = await readInventory(u, new Date(NOW.getTime() + SMELT_MS * 2 + 500));
    expect(later.inventory.furnace_out[0]).toMatchObject({ item: "gold_ingot", count: 2 });
    expect(later.inventory.furnace_in[0]?.count).toBe(1);
    const done = await readInventory(u, new Date(NOW.getTime() + SMELT_MS * 10));
    expect(done.inventory.furnace_out[0]?.count).toBe(3);
    expect(done.furnaceActive).toBe(false);
  });

  it("active un objet pour la prochaine course (un seul), et peut le retirer", async () => {
    const u = await user();
    await put(u, "bag", 0, "xp_bottle", 2);
    await put(u, "bag", 1, "diamond", 1);
    await expect(activateItem(u, 1, NOW)).rejects.toMatchObject({ code: "not_usable" });
    const view = await activateItem(u, 0, NOW);
    expect(view.activeItem).toBe("xp_bottle");
    expect(view.inventory.bag[0]?.count).toBe(1);
    await expect(activateItem(u, 0, NOW)).rejects.toMatchObject({ code: "already_active" });
    const back = await deactivateItem(u, NOW);
    expect(back.activeItem).toBeNull();
    expect(back.inventory.bag[0]?.count).toBe(2);
  });
});

describe("table d'enchantement", () => {
  it("enchante une fois, paie les niveaux, change la graine ; refuse sans niveau ou deux fois", async () => {
    const u = await user(totalXpForLevel(30));
    await put(u, "bag", 0, "diamond_chestplate", 1, 100);
    const { rows } = await client.query<{ enchant_seed: number }>(
      `select enchant_seed from users where id = $1`,
      [u],
    );
    const seed = rows[0]!.enchant_seed;
    const placed = await moveInInventory(
      u,
      { area: "bag", slot: 0 },
      { area: "enchant", slot: 0 },
      undefined,
      NOW,
    );
    expect(placed.enchantOptions.map((o) => o.hint)).toEqual(
      [0, 1, 2].map((i) => rollEnchants("diamond_chestplate", seed, i)[0]),
    );

    const { view, result } = await enchantItem(u, 2, NOW);
    expect(result.enchants).toEqual(rollEnchants("diamond_chestplate", seed, 2));
    expect(view.inventory.enchant[0]?.enchants).toEqual(result.enchants);
    expect(levelFromXp(view.xp).level).toBe(27);
    expect(view.enchantOptions).toEqual([]); // déjà enchantée : plus de choix
    await expect(enchantItem(u, 0, NOW)).rejects.toMatchObject({ code: "nothing_to_enchant" });
    const after = await client.query<{ enchant_seed: number }>(
      `select enchant_seed from users where id = $1`,
      [u],
    );
    expect(after.rows[0]!.enchant_seed).not.toBe(seed);

    // L'enchantement reste sur la pièce quand on la range.
    const back = await moveInInventory(
      u,
      { area: "enchant", slot: 0 },
      { area: "bag", slot: -1 },
      undefined,
      NOW,
    );
    expect(back.inventory.bag[0]?.enchants).toEqual(result.enchants);

    const low = await user(totalXpForLevel(10));
    await put(low, "enchant", 0, "iron_boots", 1, 50);
    await expect(enchantItem(low, 1, NOW)).rejects.toMatchObject({ code: "level_too_low" });
    expect(
      (await enchantItem(low, 0, NOW)).view.inventory.enchant[0]?.enchants?.length,
    ).toBeGreaterThan(0);
  });

  it("fin de course : Réparation sur le podium, Disparition à l'abandon", async () => {
    const u = await user();
    await client.query(
      `insert into inventory_items (user_id, area, slot, item, count, durability, enchants) values
       ($1, 'armor', 0, 'iron_helmet', 1, 10, '[{"id":"mending","level":1}]'),
       ($1, 'armor', 1, 'iron_chestplate', 1, 50, '[{"id":"vanishing_curse","level":1}]')`,
      [u],
    );
    await finishRaceForUser(u, 0, { podium: true, abandoned: false }, NOW, () => 0.9);
    let inv = (await readInventory(u, NOW)).inventory;
    expect(inv.armor[0]?.durability).toBe(10); // −1 d'usure, +1 de réparation
    expect(inv.armor[1]?.durability).toBe(49);
    await finishRaceForUser(u, 0, { podium: false, abandoned: true }, NOW, () => 0.9);
    inv = (await readInventory(u, NOW)).inventory;
    expect(inv.armor[1]).toBeNull();
    expect(inv.armor[0]?.durability).toBe(9);
  });
});

describe("effets en course", () => {
  const TEXT = Array.from({ length: 40 }, (_, i) => `mot${i}`).join(" ");

  async function raceWith(players: { userId?: string; isBot?: boolean }[]) {
    const host = await user();
    const { rows: l } = await client.query<{ id: string }>(
      `insert into lobbies (code, host_user_id, name, complexity) values ($1, $2, 'inv', 'easy') returning id`,
      [`I${suffix().toUpperCase().slice(0, 5)}`, host],
    );
    const { rows } = await client.query<{ id: string }>(
      `insert into races (lobby_id, text_content, language, status, starts_at, duration_seconds, settings)
       values ($1, $2, 'fr', 'finished', now(), 60, '{"complexity":"easy"}') returning id`,
      [l[0]!.id, TEXT],
    );
    const raceId = rows[0]!.id;
    const ids: string[] = [];
    for (const p of players) {
      const { rows: r } = await client.query<{ id: string }>(
        `insert into race_participants (race_id, user_id, display_name, is_bot, bot_level)
         values ($1, $2, 'p', $3, $4) returning id`,
        [raceId, p.userId ?? null, !!p.isBot, p.isBot ? "noob" : null],
      );
      ids.push(r[0]!.id);
    }
    return { raceId, ids };
  }

  function result(id: string, p: Partial<RacerResult>): RacerResult {
    return {
      id,
      isBot: false,
      botLevel: null,
      userId: null,
      guestId: null,
      rank: 1,
      status: "finished",
      abandonReason: null,
      accuracy: 90,
      ...p,
    } as RacerResult;
  }

  it("fige l'armure et l'objet au départ, consomme l'objet, puis applique l'XP, l'usure et le charbon", async () => {
    const gold = await user();
    for (const [slot, part] of ["helmet", "chestplate", "leggings", "boots"].entries()) {
      await put(gold, "armor", slot, `gold_${part}`, 1, slot === 3 ? 1 : 25);
    }
    await client.query(`update users set active_item = 'xp_bottle' where id = $1`, [gold]);
    const { raceId, ids } = await raceWith([{ userId: gold }, { isBot: true }]);

    await db.transaction().execute((trx) => snapshotLoadouts(trx, raceId));
    const { rows } = await client.query<{
      loadout: { xpBonus: number; item: string; dodge: number };
    }>(`select loadout from race_participants where id = $1`, [ids[0]]);
    expect(rows[0]!.loadout).toMatchObject({ xpBonus: 0.8, item: "xp_bottle", dodge: 0.12 });
    expect(
      (await client.query(`select active_item from users where id = $1`, [gold])).rows[0]
        .active_item,
    ).toBeNull();

    const results = [
      result(ids[0]!, { userId: gold, rank: 1 }),
      result(ids[1]!, { isBot: true, botLevel: "noob", rank: 2 }),
    ];
    const rolls = [0, 0.9]; // gagne (0 < 60 %), puis le 2e tirage donne 2 charbons
    await awardRaceXp(raceId, results, () => rolls.shift() ?? 0);
    const base = raceXp({
      complexity: "easy",
      words: 40,
      opponents: [{ isBot: true, botLevel: "noob" }],
      status: "finished",
      rank: 1,
      accuracy: 90,
    });
    expect(await xpOf(gold)).toBe(Math.round(base * 1.8));

    const inv = await readInventory(gold);
    expect(inv.inventory.armor[0]?.durability).toBe(24);
    expect(inv.inventory.armor[3]).toBeNull(); // les bottes avaient 1 de durabilité : brisées
    expect(inv.inventory.bag[0]).toMatchObject({ item: "coal", count: 2 });
    const { rows: gained } = await client.query<{ coal_gained: number | null }>(
      `select coal_gained from race_participants where race_id = $1 order by is_bot`,
      [raceId],
    );
    expect(gained.map((g) => g.coal_gained)).toEqual([2, null]);
  });

  it("le totem évite la perte de niveau à l'abandon ; pas de charbon sans podium", async () => {
    const quitter = await user(500);
    await client.query(`update users set active_item = 'totem' where id = $1`, [quitter]);
    const { raceId, ids } = await raceWith([{ userId: quitter }, { isBot: true }]);
    await db.transaction().execute((trx) => snapshotLoadouts(trx, raceId));
    await awardRaceXp(
      raceId,
      [
        result(ids[0]!, { userId: quitter, rank: 2, status: "abandoned", abandonReason: "player" }),
        result(ids[1]!, { isBot: true, botLevel: "noob", rank: 1 }),
      ],
      () => 0,
    );
    expect(await xpOf(quitter)).toBe(500);
    const { rows } = await client.query(`select coal_gained from race_participants where id = $1`, [
      ids[0],
    ]);
    expect(rows[0].coal_gained).toBe(0);
  });
});
