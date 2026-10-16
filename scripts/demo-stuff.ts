// Outil de démonstration (développement local seulement) : remplit l'inventaire d'un compte avec le
// meilleur équipement possible, pour voir tout ce que l'inventaire, le four et l'enchantement permettent.
// Usage : bun run demo:stuff [nom_utilisateur]   (alice par défaut)
// Refuse de toucher une base qui n'est pas sur cet ordinateur.
import { Client } from "pg";
import { RESOURCES } from "@/lib/items";
import { totalXpForLevel } from "@/lib/xp";

const username = process.argv[2] ?? "alice";
const url = process.env.DATABASE_URL ?? "postgresql://keymine:keymine@127.0.0.1:54329/keymine";
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`[demo] base « ${host} » : ce script ne sert qu'en local, rien n'a été changé.`);
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
const { rows } = await client.query<{ id: string }>(`select id from users where username = $1`, [
  username,
]);
const userId = rows[0]?.id;
if (!userId) {
  console.error(`[demo] compte « ${username} » introuvable (lance d'abord bun run db:seed).`);
  process.exit(1);
}

// Netherite complète, enchantée au maximum (3 enchantements par pièce).
const best = (extra: { id: string; level: number }) => [
  { id: "protection", level: 4 },
  extra,
  { id: "unbreaking", level: 3 },
];
const armor: [number, string, unknown][] = [
  [0, "netherite_helmet", best({ id: "respiration", level: 3 })],
  [1, "netherite_chestplate", best({ id: "thorns", level: 3 })],
  [2, "netherite_leggings", best({ id: "fortune", level: 3 })],
  [3, "netherite_boots", best({ id: "feather_falling", level: 4 })],
];

// Sac : 64 de chaque ressource, des objets à usage unique, et des pièces à enchanter soi-même.
const bag: [string, number, number | null][] = [
  ...RESOURCES.map((item) => [item, 64, null] as [string, number, null]),
  ["enchanted_golden_apple", 64, null],
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

await client.query("begin");
await client.query(`delete from inventory_items where user_id = $1`, [userId]);
for (const [slot, item, enchants] of armor) {
  await client.query(
    `insert into inventory_items (user_id, area, slot, item, count, durability, enchants)
     values ($1, 'armor', $2, $3, 1, 150, $4)`,
    [userId, slot, item, JSON.stringify(enchants)],
  );
}
for (const [slot, [item, count, durability]] of bag.entries()) {
  await client.query(
    `insert into inventory_items (user_id, area, slot, item, count, durability) values ($1, 'bag', $2, $3, $4, $5)`,
    [userId, slot, item, count, durability],
  );
}
await client.query(
  `update users set xp_total = $2, active_item = 'enchanted_golden_apple' where id = $1`,
  [userId, totalXpForLevel(100)],
);
await client.query("commit");
await client.end();
console.log(
  `[demo] ${username} : niveau 100, netherite enchantée, 64 de chaque ressource, pomme activée.`,
);
