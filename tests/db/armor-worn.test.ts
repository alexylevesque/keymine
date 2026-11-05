import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({})); // garde-fou de Next, sans objet dans les tests

import { loadWornArmor } from "@/lib/armor-worn";

// Armure réellement portée (accueil et course) : lue dans les cases « armor » 0 à 3 de l'inventaire.
const client = new Client({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

async function user() {
  const name = `arm_${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await client.query<{ id: string }>(
    `insert into users (username, password_hash, display_name) values ($1, 'x', $1) returning id`,
    [name],
  );
  return rows[0]!.id;
}

async function put(userId: string, area: string, slot: number, item: string) {
  await client.query(
    `insert into inventory_items (user_id, area, slot, item, count) values ($1, $2, $3, $4, 1)`,
    [userId, area, slot, item],
  );
}

describe("loadWornArmor", () => {
  it("renvoie le matériau de chaque pièce portée, et rien pour un compte sans armure", async () => {
    const a = await user();
    const b = await user();
    await put(a, "armor", 0, "iron_helmet");
    await put(a, "armor", 3, "diamond_boots");
    await put(a, "bag", 0, "gold_chestplate"); // dans le sac : pas portée

    const worn = await loadWornArmor([a, b]);
    expect(worn.get(a)).toEqual({ helmet: "iron", boots: "diamond" });
    expect(worn.has(b)).toBe(false);
  });

  it("ne fait pas de requête sans compte", async () => {
    expect((await loadWornArmor([])).size).toBe(0);
  });
});
