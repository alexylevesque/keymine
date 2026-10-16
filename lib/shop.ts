// Boutique (fonctionnalité ajoutée) : 6 offres par jour et par compte, renouvelées à minuit (heure de
// Toronto). Le tirage est déterministe (graine = compte + jour) : la même journée donne les mêmes offres,
// ce qui le rend testable. Logique pure ; l'enregistrement est dans lib/inventory-store.ts.
import { createRng, seedFromString } from "@/lib/text/rng";
import {
  ARMOR_IDS,
  armorInfo,
  OFFERS_PER_DAY,
  RARITY_STOCK,
  RARITY_WEIGHTS,
  readyMadePrice,
  SHOP_POOLS,
  type ArmorId,
  type ItemId,
  type Rarity,
} from "./items";

export const SHOP_TIME_ZONE = "America/Toronto";

export type Offer = {
  slot: number;
  item: ItemId;
  /** Objets reçus par achat (ex. 4 charbons). */
  count: number;
  /** Prix en XP d'un achat. */
  price: number;
  rarity: Rarity;
  /** Achats permis aujourd'hui. */
  stock: number;
};

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Jour de la boutique (AAAA-MM-JJ, heure de Toronto). */
export function shopDay(now: Date): string {
  return dayFormat.format(now);
}

/** Prochain minuit à Toronto (changements d'heure compris). */
export function nextShopReset(now: Date): Date {
  const today = shopDay(now);
  // On avance par heures jusqu'au changement de jour, puis par secondes dans l'heure trouvée.
  let t = now.getTime();
  while (shopDay(new Date(t + 3_600_000)) === today) t += 3_600_000;
  let lo = t;
  let hi = t + 3_600_000;
  while (hi - lo > 1_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (shopDay(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return new Date(Math.ceil(hi / 1_000) * 1_000);
}

function pickRarity(rng: () => number): Rarity {
  let roll = rng();
  for (const [rarity, weight] of RARITY_WEIGHTS) {
    if (roll < weight) return rarity;
    roll -= weight;
  }
  return "common";
}

const READY_MADE: ArmorId[] = ARMOR_IDS.filter((id) => armorInfo(id)?.material !== "netherite");

/** Les offres du jour d'un compte (sans doublon). */
export function generateOffers(userId: string, day: string): Offer[] {
  const rng = createRng(seedFromString(`${userId}:${day}`));
  const offers: Offer[] = [];
  for (let attempt = 0; offers.length < OFFERS_PER_DAY && attempt < 100; attempt++) {
    const rarity = pickRarity(rng);
    const pool = SHOP_POOLS[rarity];
    const entry = pool[Math.floor(rng() * pool.length)]!;
    const item: ItemId =
      entry.item === "random_armor"
        ? READY_MADE[Math.floor(rng() * READY_MADE.length)]!
        : entry.item;
    if (offers.some((o) => o.item === item)) continue;
    offers.push({
      slot: offers.length,
      item,
      count: entry.count,
      price: entry.item === "random_armor" ? readyMadePrice(item as ArmorId) : entry.price,
      rarity,
      stock: RARITY_STOCK[rarity],
    });
  }
  return offers;
}
