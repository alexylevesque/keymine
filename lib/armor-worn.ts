import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItems } from "@/db/schema";
import type { WornArmor } from "@/lib/armor-look";

const PARTS = ["helmet", "chestplate", "leggings", "boots"] as const;

/** Armure portée par chaque compte (cases « armor » 0 à 3 de l'inventaire), par identifiant de compte. */
export async function loadWornArmor(userIds: string[]): Promise<Map<string, WornArmor>> {
  const out = new Map<string, WornArmor>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({ user: inventoryItems.user_id, slot: inventoryItems.slot, item: inventoryItems.item })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.area, "armor"), inArray(inventoryItems.user_id, userIds)));
  for (const r of rows) {
    const part = PARTS[r.slot];
    if (!part) continue;
    const worn = out.get(r.user) ?? {};
    worn[part] = r.item.split("_")[0];
    out.set(r.user, worn);
  }
  return out;
}
