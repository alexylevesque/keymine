// Inventaire et boutique en base (fonctionnalité ajoutée). Chaque opération se fait dans une transaction
// qui verrouille la ligne du compte : deux onglets ne peuvent pas acheter ou déplacer en même temps.
// Le serveur est la source de vérité : le client envoie une intention (déplacer, fabriquer, acheter),
// le serveur la valide avec la logique pure de lib/inventory.ts et lib/shop.ts.
// Sans dépendance à Next.js : aussi appelé par le serveur temps réel en fin de course.
import { sql, type Transaction } from "kysely";
import type { Database, InventoryArea } from "@/db/types";
import { db } from "@/lib/db";
import {
  addToBag,
  AREAS,
  bagFits,
  computeLoadout,
  craft,
  emptyInventory,
  furnaceActive,
  InventoryError,
  moveItem,
  newStack,
  NO_LOADOUT,
  settleFurnace,
  wearArmor,
  type Inventory,
  type Loadout,
  type SlotRef,
  type Stack,
} from "@/lib/inventory";
import { isConsumable, isItemId, type ItemId } from "@/lib/items";
import { generateOffers, nextShopReset, shopDay, type Offer } from "@/lib/shop";

type Trx = Transaction<Database>;

export type ShopError = "offer_unknown" | "sold_out" | "not_enough_xp" | "inventory_full";
export class ShopRefusal extends Error {
  constructor(readonly code: ShopError) {
    super(code);
  }
}
export class ItemRefusal extends Error {
  constructor(
    readonly code: "already_active" | "nothing_active" | "not_usable" | "inventory_full",
  ) {
    super(code);
  }
}

async function lockUser(trx: Trx, userId: string) {
  return trx
    .selectFrom("users")
    .select(["id", "xp_total", "active_item"])
    .where("id", "=", userId)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

/** Charge l'inventaire et fait avancer le four jusqu'à `now`. */
async function load(trx: Trx, userId: string, now: Date): Promise<Inventory> {
  const inv = emptyInventory();
  const rows = await trx
    .selectFrom("inventory_items")
    .select(["area", "slot", "item", "count", "durability"])
    .where("user_id", "=", userId)
    .execute();
  for (const row of rows) {
    // Un code d'objet inconnu (retiré du catalogue) est ignoré plutôt que de tout bloquer.
    if (!isItemId(row.item) || !(AREAS as readonly string[]).includes(row.area)) continue;
    const slots = inv[row.area];
    if (row.slot < slots.length)
      slots[row.slot] = { item: row.item, count: row.count, durability: row.durability };
  }
  const furnace = await trx
    .selectFrom("furnaces")
    .select(["burn_left", "progress_ms", "updated_at"])
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (furnace) {
    inv.furnace = { burnLeft: furnace.burn_left, progressMs: furnace.progress_ms };
    settleFurnace(inv, now.getTime() - new Date(furnace.updated_at).getTime());
  }
  return inv;
}

async function save(trx: Trx, userId: string, inv: Inventory, now: Date) {
  await trx.deleteFrom("inventory_items").where("user_id", "=", userId).execute();
  const rows = AREAS.flatMap((area) =>
    inv[area].flatMap((s, slot) =>
      s
        ? [
            {
              user_id: userId,
              area: area as InventoryArea,
              slot,
              item: s.item,
              count: s.count,
              durability: s.durability,
            },
          ]
        : [],
    ),
  );
  if (rows.length > 0) await trx.insertInto("inventory_items").values(rows).execute();
  await trx
    .insertInto("furnaces")
    .values({
      user_id: userId,
      burn_left: inv.furnace.burnLeft,
      progress_ms: inv.furnace.progressMs,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("user_id").doUpdateSet({
        burn_left: inv.furnace.burnLeft,
        progress_ms: inv.furnace.progressMs,
        updated_at: now,
      }),
    )
    .execute();
}

export type InventoryView = {
  inventory: Inventory;
  activeItem: ItemId | null;
  xp: number;
  /** Le four cuit en ce moment (le client anime la flèche et se rafraîchit). */
  furnaceActive: boolean;
  serverNow: number;
};

/** Ouvre l'inventaire d'un compte, applique `change`, enregistre et renvoie la vue à jour. */
async function withInventory<T>(
  userId: string,
  change: (
    inv: Inventory,
    user: { xp: number; activeItem: string | null },
    trx: Trx,
  ) => Promise<T> | T,
  now = new Date(),
): Promise<{ view: InventoryView; result: T }> {
  return db.transaction().execute(async (trx) => {
    const user = await lockUser(trx, userId);
    const inv = await load(trx, userId, now);
    const result = await change(inv, { xp: user.xp_total, activeItem: user.active_item }, trx);
    await save(trx, userId, inv, now);
    const after = await trx
      .selectFrom("users")
      .select(["xp_total", "active_item"])
      .where("id", "=", userId)
      .executeTakeFirstOrThrow();
    return {
      result,
      view: {
        inventory: inv,
        activeItem: isItemId(after.active_item) ? after.active_item : null,
        xp: after.xp_total,
        furnaceActive: furnaceActive(inv),
        serverNow: now.getTime(),
      },
    };
  });
}

export async function readInventory(userId: string, now = new Date()): Promise<InventoryView> {
  return (await withInventory(userId, () => null, now)).view;
}

export async function moveInInventory(
  userId: string,
  from: SlotRef,
  to: SlotRef,
  count?: number,
  now = new Date(),
) {
  return (await withInventory(userId, (inv) => moveItem(inv, from, to, count), now)).view;
}

export async function craftInInventory(userId: string, now = new Date()) {
  return withInventory(userId, (inv) => craft(inv), now);
}

/** Active un objet à usage unique du sac pour la prochaine course (un seul à la fois). */
export async function activateItem(userId: string, slot: number, now = new Date()) {
  return (
    await withInventory(
      userId,
      async (inv, user, trx) => {
        if (user.activeItem) throw new ItemRefusal("already_active");
        const stack = inv.bag[slot];
        if (!stack || !isConsumable(stack.item)) throw new ItemRefusal("not_usable");
        stack.count -= 1;
        if (stack.count === 0) inv.bag[slot] = null;
        await trx
          .updateTable("users")
          .set({ active_item: stack.item })
          .where("id", "=", userId)
          .execute();
      },
      now,
    )
  ).view;
}

/** Retire l'objet activé et le remet dans le sac. */
export async function deactivateItem(userId: string, now = new Date()) {
  return (
    await withInventory(
      userId,
      async (inv, user, trx) => {
        if (!user.activeItem || !isItemId(user.activeItem)) throw new ItemRefusal("nothing_active");
        if (addToBag(inv, newStack(user.activeItem)) === 0) throw new ItemRefusal("inventory_full");
        await trx
          .updateTable("users")
          .set({ active_item: null })
          .where("id", "=", userId)
          .execute();
      },
      now,
    )
  ).view;
}

// ---- Boutique ----

export type ShopView = {
  offers: (Offer & { bought: number })[];
  xp: number;
  /** Prochain renouvellement (minuit, heure de Toronto), en ms. */
  resetsAt: number;
  serverNow: number;
};

async function ensureOffers(trx: Trx | typeof db, userId: string, day: string) {
  const offers = generateOffers(userId, day);
  await trx
    .insertInto("shop_offers")
    .values(offers.map((o) => ({ user_id: userId, day, ...o })))
    .onConflict((oc) => oc.doNothing())
    .execute();
}

async function offersOf(trx: Trx | typeof db, userId: string, day: string) {
  const rows = await trx
    .selectFrom("shop_offers")
    .select(["slot", "item", "count", "price", "rarity", "stock", "bought"])
    .where("user_id", "=", userId)
    .where("day", "=", day)
    .orderBy("slot")
    .execute();
  return rows.flatMap((r) => (isItemId(r.item) ? [{ ...r, item: r.item }] : []));
}

export async function readShop(userId: string, now = new Date()): Promise<ShopView> {
  const day = shopDay(now);
  await ensureOffers(db, userId, day);
  const user = await db
    .selectFrom("users")
    .select("xp_total")
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
  return {
    offers: await offersOf(db, userId, day),
    xp: user.xp_total,
    resetsAt: nextShopReset(now).getTime(),
    serverNow: now.getTime(),
  };
}

/** Achète une fois l'offre de la case `slot` : paie en XP (le niveau peut baisser), range dans le sac. */
export async function buyOffer(userId: string, slot: number, now = new Date()): Promise<ShopView> {
  const day = shopDay(now);
  await ensureOffers(db, userId, day);
  await withInventory(
    userId,
    async (inv, user, trx) => {
      const offer = await trx
        .selectFrom("shop_offers")
        .select(["item", "count", "price", "stock", "bought"])
        .where("user_id", "=", userId)
        .where("day", "=", day)
        .where("slot", "=", slot)
        .executeTakeFirst();
      if (!offer || !isItemId(offer.item)) throw new ShopRefusal("offer_unknown");
      if (offer.bought >= offer.stock) throw new ShopRefusal("sold_out");
      if (user.xp < offer.price) throw new ShopRefusal("not_enough_xp");
      if (!bagFits(inv, offer.item, offer.count)) throw new ShopRefusal("inventory_full");
      addToBag(inv, newStack(offer.item, offer.count));
      await trx
        .updateTable("users")
        .set({ xp_total: sql<number>`xp_total - ${offer.price}` })
        .where("id", "=", userId)
        .execute();
      await trx
        .updateTable("shop_offers")
        .set({ bought: sql<number>`bought + 1` })
        .where("user_id", "=", userId)
        .where("day", "=", day)
        .where("slot", "=", slot)
        .execute();
    },
    now,
  );
  return readShop(userId, now);
}

// ---- Courses ----

/**
 * Au départ d'une course : fige les effets de l'armure et de l'objet activé de chaque compte participant
 * (dans `race_participants.loadout`), et consomme l'objet activé.
 */
export async function snapshotLoadouts(trx: Trx, raceId: string) {
  const rows = await trx
    .selectFrom("race_participants")
    .innerJoin("users", "users.id", "race_participants.user_id")
    .select(["race_participants.id", "race_participants.user_id", "users.active_item"])
    .where("race_participants.race_id", "=", raceId)
    .where("race_participants.role", "=", "participant")
    .where("race_participants.is_bot", "=", false)
    .execute();
  for (const row of rows) {
    if (!row.user_id) continue;
    const armorRows = await trx
      .selectFrom("inventory_items")
      .select(["slot", "item"])
      .where("user_id", "=", row.user_id)
      .where("area", "=", "armor")
      .execute();
    const armor: (Stack | null)[] = [null, null, null, null];
    for (const a of armorRows) if (isItemId(a.item) && a.slot < 4) armor[a.slot] = newStack(a.item);
    const active = isItemId(row.active_item) ? row.active_item : null;
    const loadout = computeLoadout(armor, active);
    await trx
      .updateTable("race_participants")
      .set({ loadout: JSON.stringify(loadout) })
      .where("id", "=", row.id)
      .execute();
    if (active)
      await trx
        .updateTable("users")
        .set({ active_item: null })
        .where("id", "=", row.user_id)
        .execute();
  }
}

/** Relit un équipement enregistré (null ou mal formé : aucun effet). */
export function parseLoadout(value: unknown): Loadout {
  const v = (typeof value === "string" ? safeJson(value) : value) as Partial<Loadout> | null;
  if (!v || typeof v !== "object") return { ...NO_LOADOUT };
  const num = (n: unknown, max: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  return {
    dodge: num(v.dodge, 0.37),
    xpBonus: num(v.xpBonus, 1),
    immuneAll: v.immuneAll === true,
    immuneFog: v.immuneFog === true,
    shield: Math.floor(num(v.shield, 3)),
    noLevelLoss: v.noLevelLoss === true,
    item: isItemId(v.item) ? v.item : null,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Fin de course pour un compte : usure de l'armure portée et charbon gagné. Renvoie le charbon reçu. */
export async function finishRaceForUser(
  userId: string,
  coal: number,
  now = new Date(),
): Promise<number> {
  const { result } = await withInventory(
    userId,
    (inv) => {
      wearArmor(inv);
      return coal > 0 ? addToBag(inv, newStack("coal", coal)) : 0;
    },
    now,
  );
  return result;
}

export { InventoryError };
