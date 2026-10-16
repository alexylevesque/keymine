import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import {
  activateItem,
  buyOffer,
  craftInInventory,
  deactivateItem,
  moveInInventory,
  readInventory,
  readShop,
} from "@/lib/inventory-store";
import { InventoryError, SMELT_MS } from "@/lib/inventory";
import { generateOffers, shopDay } from "@/lib/shop";

// Inventaire, boutique et four (fonctionnalité ajoutée), contre une vraie base.
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
