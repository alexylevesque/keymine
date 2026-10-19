// Outil de démonstration (développement local seulement) : remplit l'inventaire d'un compte avec le
// meilleur équipement possible, pour voir tout ce que l'inventaire, le four et l'enchantement permettent.
// Usage : bun run demo:stuff [nom_utilisateur]   (alice par défaut)
// Refuse de toucher une base qui n'est pas sur cet ordinateur.
import { eq } from "drizzle-orm";
import { inventoryItems, users } from "@/db/schema";
import type { Enchant } from "@/lib/enchants";
import { RESOURCES } from "@/lib/items";
import { totalXpForLevel } from "@/lib/xp";
import { localDemoDb } from "./demo-db";

const username = process.argv[2] ?? "alice";
const { db, closeDb } = await localDemoDb();
const user = await db.query.users.findFirst({
  columns: { id: true },
  where: eq(users.username, username),
});
const userId = user?.id;
if (!userId) {
  console.error(`[demo] compte « ${username} » introuvable (lance d'abord bun run db:seed).`);
  process.exit(1);
}

// Netherite complète, enchantée au maximum (3 enchantements par pièce).
const best = (extra: Enchant): Enchant[] => [
  { id: "protection", level: 4 },
  extra,
  { id: "unbreaking", level: 3 },
];
const armor: [number, string, Enchant[]][] = [
  [0, "netherite_helmet", best({ id: "respiration", level: 3 })],
  [1, "netherite_chestplate", best({ id: "thorns", level: 3 })],
  [2, "netherite_leggings", best({ id: "fortune", level: 3 })],
  [3, "netherite_boots", best({ id: "feather_falling", level: 4 })],
];

// Sac : 64 de chaque ressource, des objets à usage unique, et des pièces à enchanter soi-même.
const bag: [string, number, number | null][] = [
  ...RESOURCES.map((item) => [item, 64, null] as [string, number, null]),
  ["enchanted_golden_apple", 64, null],
  ["golden_apple", 64, null],
  ["xp_bottle", 64, null],
  ["totem", 1, null],
  ["shield", 1, null],
  ["night_vision", 1, null],
  ["diamond_helmet", 1, 100],
  ["diamond_chestplate", 1, 100],
  ["diamond_leggings", 1, 100],
  ["diamond_boots", 1, 100],
  ["gold_chestplate", 1, 25],
  ["iron_boots", 1, 50],
];

await db.transaction(async (tx) => {
  await tx.delete(inventoryItems).where(eq(inventoryItems.user_id, userId));
  await tx.insert(inventoryItems).values([
    ...armor.map(([slot, item, enchants]) => ({
      user_id: userId,
      area: "armor" as const,
      slot,
      item,
      count: 1,
      durability: 150,
      enchants,
    })),
    ...bag.map(([item, count, durability], slot) => ({
      user_id: userId,
      area: "bag" as const,
      slot,
      item,
      count,
      durability,
    })),
  ]);
  await tx
    .update(users)
    .set({ xp_total: totalXpForLevel(100), active_item: "enchanted_golden_apple" })
    .where(eq(users.id, userId));
});
await closeDb();
console.log(
  `[demo] ${username} : niveau 100, netherite enchantée, 64 de chaque ressource, pomme activée.`,
);
