// Inventaire et boutique en base (fonctionnalité ajoutée). Chaque opération se fait dans une transaction
// qui verrouille la ligne du compte : deux onglets ne peuvent pas acheter ou déplacer en même temps.
// Le serveur est la source de vérité : le client envoie une intention (déplacer, fabriquer, acheter),
// le serveur la valide avec la logique pure de lib/inventory.ts et lib/shop.ts.
// Sans dépendance à Next.js : aussi appelé par le serveur temps réel en fin de course.
import { and, asc, eq, sql } from "drizzle-orm";
import type { InventoryArea } from "@/db/types";
import { db, type Tx } from "@/lib/db";
import { furnaces, inventoryItems, raceParticipants, shopOffers, users } from "@/db/schema";
import {
  addToBag,
  AREAS,
  bagFits,
  computeLoadout,
  craft,
  emptyInventory,
  furnaceActive,
  InventoryError,
  MAX_DODGE,
  mendArmor,
  moveItem,
  newStack,
  NO_LOADOUT,
  settleFurnace,
  vanishArmor,
  wearArmor,
  type Inventory,
  type Loadout,
  type SlotRef,
  type Stack,
} from "@/lib/inventory";
import { armorInfo, discardXp, isConsumable, isItemId, type ItemId } from "@/lib/items";
import {
  enchantOptions,
  levelCostXp,
  OPTION_COST,
  OPTION_MIN_LEVEL,
  parseEnchants,
  rollEnchants,
  type EnchantOption,
} from "@/lib/enchants";
import { levelFromXp } from "@/lib/xp";
import { generateOffers, nextShopReset, shopDay, type Offer } from "@/lib/shop";

type Trx = Tx;

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
  const [user] = await trx
    .select({
      id: users.id,
      xp_total: users.xp_total,
      active_item: users.active_item,
      enchant_seed: users.enchant_seed,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!user) throw new Error(`compte introuvable : ${userId}`);
  return user;
}

/** Charge l'inventaire et fait avancer le four jusqu'à `now`. */
async function load(trx: Trx, userId: string, now: Date): Promise<Inventory> {
  const inv = emptyInventory();
  const rows = await trx
    .select({
      area: inventoryItems.area,
      slot: inventoryItems.slot,
      item: inventoryItems.item,
      count: inventoryItems.count,
      durability: inventoryItems.durability,
      enchants: inventoryItems.enchants,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.user_id, userId));
  for (const row of rows) {
    // Un code d'objet inconnu (retiré du catalogue) est ignoré plutôt que de tout bloquer.
    if (!isItemId(row.item) || !(AREAS as readonly string[]).includes(row.area)) continue;
    const slots = inv[row.area];
    if (row.slot >= slots.length) continue;
    const enchants = parseEnchants(row.enchants);
    slots[row.slot] = {
      item: row.item,
      count: row.count,
      durability: row.durability,
      ...(enchants.length > 0 ? { enchants } : {}),
    };
  }
  const [furnace] = await trx
    .select({
      burn_left: furnaces.burn_left,
      progress_ms: furnaces.progress_ms,
      updated_at: furnaces.updated_at,
    })
    .from(furnaces)
    .where(eq(furnaces.user_id, userId));
  if (furnace) {
    inv.furnace = { burnLeft: furnace.burn_left, progressMs: furnace.progress_ms };
    settleFurnace(inv, now.getTime() - new Date(furnace.updated_at).getTime());
  }
  return inv;
}

async function save(trx: Trx, userId: string, inv: Inventory, now: Date) {
  await trx.delete(inventoryItems).where(eq(inventoryItems.user_id, userId));
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
              enchants: s.enchants?.length ? s.enchants : null,
            },
          ]
        : [],
    ),
  );
  if (rows.length > 0) await trx.insert(inventoryItems).values(rows);
  await trx
    .insert(furnaces)
    .values({
      user_id: userId,
      burn_left: inv.furnace.burnLeft,
      progress_ms: inv.furnace.progressMs,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: furnaces.user_id,
      set: {
        burn_left: inv.furnace.burnLeft,
        progress_ms: inv.furnace.progressMs,
        updated_at: now,
      },
    });
}

export type InventoryView = {
  inventory: Inventory;
  activeItem: ItemId | null;
  xp: number;
  /** Le four cuit en ce moment (le client anime la flèche et se rafraîchit). */
  furnaceActive: boolean;
  /** Les trois choix de la table d'enchantement pour la pièce posée dessus (la graine reste secrète). */
  enchantOptions: EnchantOption[];
  serverNow: number;
};

/** Pièce posée sur la table d'enchantement, si elle peut être enchantée. */
function enchantable(inv: Inventory): Stack | null {
  const s = inv.enchant[0];
  return s && armorInfo(s.item) && !s.enchants?.length ? s : null;
}

/** Ouvre l'inventaire d'un compte, applique `change`, enregistre et renvoie la vue à jour. */
export async function withInventory<T>(
  userId: string,
  change: (
    inv: Inventory,
    user: { xp: number; activeItem: string | null; enchantSeed: number },
    trx: Trx,
  ) => Promise<T> | T,
  now = new Date(),
): Promise<{ view: InventoryView; result: T }> {
  return db.transaction(async (trx) => {
    const user = await lockUser(trx, userId);
    const inv = await load(trx, userId, now);
    const result = await change(
      inv,
      { xp: user.xp_total, activeItem: user.active_item, enchantSeed: user.enchant_seed },
      trx,
    );
    await save(trx, userId, inv, now);
    const [after] = await trx
      .select({
        xp_total: users.xp_total,
        active_item: users.active_item,
        enchant_seed: users.enchant_seed,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!after) throw new Error(`compte introuvable : ${userId}`);
    return {
      result,
      view: {
        inventory: inv,
        activeItem: isItemId(after.active_item) ? after.active_item : null,
        xp: after.xp_total,
        furnaceActive: furnaceActive(inv),
        enchantOptions: (() => {
          const piece = enchantable(inv);
          return piece ? enchantOptions(piece.item, after.enchant_seed) : [];
        })(),
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

/** Jette des objets d'une case (définitif) et rend une partie de leur valeur en XP. */
export async function discardItem(userId: string, from: SlotRef, count?: number, now = new Date()) {
  return withInventory(
    userId,
    async (inv, _user, trx) => {
      const slots = inv[from.area];
      if (!Number.isInteger(from.slot) || from.slot < 0 || from.slot >= slots.length) {
        throw new InventoryError("bad_slot");
      }
      const stack = slots[from.slot];
      if (!stack) throw new InventoryError("empty_slot");
      const amount = Math.min(stack.count, Math.max(1, Math.floor(count ?? stack.count)));
      const gained = discardXp(stack.item, amount, stack.durability);
      stack.count -= amount;
      if (stack.count === 0) slots[from.slot] = null;
      if (gained > 0) {
        await trx
          .update(users)
          .set({ xp_total: sql`${users.xp_total} + ${gained}` })
          .where(eq(users.id, userId));
      }
      return { item: stack.item, count: amount, xp: gained };
    },
    now,
  );
}

export class EnchantRefusal extends Error {
  constructor(readonly code: "nothing_to_enchant" | "level_too_low") {
    super(code);
  }
}

/**
 * Enchante la pièce posée sur la table avec le choix `option` (0, 1 ou 2) : paie 1, 2 ou 3 niveaux (la
 * barre garde son pourcentage), applique le tirage (définitif) et change la graine pour les prochains choix.
 */
export async function enchantItem(userId: string, option: number, now = new Date()) {
  return withInventory(
    userId,
    async (inv, user, trx) => {
      const piece = enchantable(inv);
      if (!piece) throw new EnchantRefusal("nothing_to_enchant");
      const cost = OPTION_COST[option]!;
      const level = levelFromXp(user.xp).level;
      if (level < OPTION_MIN_LEVEL[option]! || level < cost)
        throw new EnchantRefusal("level_too_low");
      const enchants = rollEnchants(piece.item, user.enchantSeed, option);
      piece.enchants = enchants;
      await trx
        .update(users)
        .set({
          xp_total: sql`${users.xp_total} - ${levelCostXp(user.xp, cost)}`,
          enchant_seed: Math.floor(Math.random() * 2_000_000_000),
        })
        .where(eq(users.id, userId));
      return { item: piece.item, enchants };
    },
    now,
  );
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
        await trx.update(users).set({ active_item: stack.item }).where(eq(users.id, userId));
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
        await trx.update(users).set({ active_item: null }).where(eq(users.id, userId));
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
    .insert(shopOffers)
    .values(offers.map((o) => ({ user_id: userId, day, ...o })))
    .onConflictDoNothing();
}

async function offersOf(trx: Trx | typeof db, userId: string, day: string) {
  const rows = await trx
    .select({
      slot: shopOffers.slot,
      item: shopOffers.item,
      count: shopOffers.count,
      price: shopOffers.price,
      rarity: shopOffers.rarity,
      stock: shopOffers.stock,
      bought: shopOffers.bought,
    })
    .from(shopOffers)
    .where(and(eq(shopOffers.user_id, userId), eq(shopOffers.day, day)))
    .orderBy(asc(shopOffers.slot));
  return rows.flatMap((r) => (isItemId(r.item) ? [{ ...r, item: r.item }] : []));
}

export async function readShop(userId: string, now = new Date()): Promise<ShopView> {
  const day = shopDay(now);
  await ensureOffers(db, userId, day);
  const user = await db.query.users.findFirst({
    columns: { xp_total: true },
    where: eq(users.id, userId),
  });
  if (!user) throw new Error(`compte introuvable : ${userId}`);
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
      const [offer] = await trx
        .select({
          item: shopOffers.item,
          count: shopOffers.count,
          price: shopOffers.price,
          stock: shopOffers.stock,
          bought: shopOffers.bought,
        })
        .from(shopOffers)
        .where(
          and(eq(shopOffers.user_id, userId), eq(shopOffers.day, day), eq(shopOffers.slot, slot)),
        );
      if (!offer || !isItemId(offer.item)) throw new ShopRefusal("offer_unknown");
      if (offer.bought >= offer.stock) throw new ShopRefusal("sold_out");
      if (user.xp < offer.price) throw new ShopRefusal("not_enough_xp");
      if (!bagFits(inv, offer.item, offer.count)) throw new ShopRefusal("inventory_full");
      addToBag(inv, newStack(offer.item, offer.count));
      await trx
        .update(users)
        .set({ xp_total: sql`${users.xp_total} - ${offer.price}` })
        .where(eq(users.id, userId));
      await trx
        .update(shopOffers)
        .set({ bought: sql`${shopOffers.bought} + 1` })
        .where(
          and(eq(shopOffers.user_id, userId), eq(shopOffers.day, day), eq(shopOffers.slot, slot)),
        );
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
    .select({
      id: raceParticipants.id,
      user_id: raceParticipants.user_id,
      active_item: users.active_item,
    })
    .from(raceParticipants)
    .innerJoin(users, eq(users.id, raceParticipants.user_id))
    .where(
      and(
        eq(raceParticipants.race_id, raceId),
        eq(raceParticipants.role, "participant"),
        eq(raceParticipants.is_bot, false),
      ),
    );
  for (const row of rows) {
    if (!row.user_id) continue;
    const armorRows = await trx
      .select({
        slot: inventoryItems.slot,
        item: inventoryItems.item,
        enchants: inventoryItems.enchants,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.user_id, row.user_id), eq(inventoryItems.area, "armor")));
    const armor: (Stack | null)[] = [null, null, null, null];
    for (const a of armorRows) {
      if (isItemId(a.item) && a.slot < 4) {
        armor[a.slot] = { ...newStack(a.item), enchants: parseEnchants(a.enchants) };
      }
    }
    const active = isItemId(row.active_item) ? row.active_item : null;
    const loadout = computeLoadout(armor, active);
    await trx.update(raceParticipants).set({ loadout }).where(eq(raceParticipants.id, row.id));
    if (active) await trx.update(users).set({ active_item: null }).where(eq(users.id, row.user_id));
  }
}

/** Relit un équipement enregistré (null ou mal formé : aucun effet). */
export function parseLoadout(value: unknown): Loadout {
  const v = (typeof value === "string" ? safeJson(value) : value) as Partial<Loadout> | null;
  if (!v || typeof v !== "object") return { ...NO_LOADOUT };
  const num = (n: unknown, max: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  return {
    dodge: num(v.dodge, MAX_DODGE),
    xpBonus: num(v.xpBonus, 1),
    immuneAll: v.immuneAll === true,
    immuneFog: v.immuneFog === true,
    shield: Math.floor(num(v.shield, 3)),
    shieldKind: v.shieldKind === "shield" || v.shieldKind === "golden_apple" ? v.shieldKind : null,
    noLevelLoss: v.noLevelLoss === true,
    item: isItemId(v.item) ? v.item : null,
    fogReductionMs: Math.floor(num(v.fogReductionMs, 3_000)),
    plusWordsBlock: num(v.plusWordsBlock, 0.16),
    thorns: num(v.thorns, 0.3),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Fin de course pour un compte : usure de l'armure portée (Solidité), Réparation sur le podium, Malédiction
 * de disparition à l'abandon volontaire, et charbon gagné. Renvoie le charbon reçu.
 */
export async function finishRaceForUser(
  userId: string,
  coal: number,
  outcome: { podium: boolean; abandoned: boolean } = { podium: false, abandoned: false },
  now = new Date(),
  rng: () => number = Math.random,
): Promise<number> {
  const { result } = await withInventory(
    userId,
    (inv) => {
      if (outcome.abandoned) vanishArmor(inv);
      wearArmor(inv, rng);
      if (outcome.podium) mendArmor(inv);
      return coal > 0 ? addToBag(inv, newStack("coal", coal)) : 0;
    },
    now,
  );
  return result;
}

export { InventoryError };
