import { describe, expect, it } from "vitest";
import {
  addToBag,
  bagFits,
  computeLoadout,
  craft,
  emptyInventory,
  findRecipe,
  furnaceActive,
  InventoryError,
  moveItem,
  newStack,
  settleFurnace,
  SMELT_MS,
  wearArmor,
  type Inventory,
} from "@/lib/inventory";
import {
  armorInfo,
  discardXp,
  ITEM_IDS,
  itemValue,
  maxStack,
  podiumCoal,
  readyMadePrice,
  rarityOf,
  shopPrice,
  type ItemId,
} from "@/lib/items";
import { generateOffers, nextShopReset, shopDay } from "@/lib/shop";

/** Grille 3 × 3 écrite en lignes : X = matériau, . = vide. */
function grid(lines: string[], material: ItemId): (ItemId | null)[] {
  return lines
    .join("")
    .split("")
    .map((c) => (c === "X" ? material : null));
}

function withCraft(cells: (ItemId | null)[], count = 1): Inventory {
  const inv = emptyInventory();
  inv.craft = cells.map((c) => (c ? newStack(c, count) : null));
  return inv;
}

describe("catalogue", () => {
  it("l'armure ne s'empile pas, les matériaux vont jusqu'à 64", () => {
    expect(maxStack("iron_helmet")).toBe(1);
    expect(maxStack("totem")).toBe(1);
    expect(maxStack("coal")).toBe(64);
    expect(armorInfo("diamond_boots")).toEqual({ material: "diamond", part: "boots", slot: 3 });
    expect(armorInfo("iron_ingot")).toBeNull();
    expect(armorInfo("enchanted_golden_apple")).toBeNull();
  });

  it("prix validés : pièce déjà faite à environ 70 % de ses matériaux, jamais de netherite", () => {
    expect(readyMadePrice("iron_helmet")).toBe(46); // 0,7 × 5 × 13
    expect(readyMadePrice("diamond_chestplate")).toBe(336); // 0,7 × 8 × 60
    expect(() => readyMadePrice("netherite_boots")).toThrow();
    expect(shopPrice("coal")).toEqual({ count: 4, price: 10 });
    expect(shopPrice("enchanted_golden_apple")).toEqual({ count: 1, price: 250 });
    expect(shopPrice("netherite_ingot")).toBeNull();
    expect(rarityOf("totem")).toBe("rare");
    expect(rarityOf("netherite_helmet")).toBeNull();
  });
});

describe("table de craft 3 × 3", () => {
  it("reconnaît les quatre pièces, où qu'elles soient dans la grille", () => {
    expect(findRecipe(grid(["XXX", "X.X", "..."], "iron_ingot"))?.result).toBe("iron_helmet");
    expect(findRecipe(grid(["...", "XXX", "X.X"], "iron_ingot"))?.result).toBe("iron_helmet");
    expect(findRecipe(grid(["X.X", "XXX", "XXX"], "leather"))?.result).toBe("leather_chestplate");
    expect(findRecipe(grid(["XXX", "X.X", "X.X"], "gold_ingot"))?.result).toBe("gold_leggings");
    expect(findRecipe(grid(["...", "X.X", "X.X"], "diamond"))?.result).toBe("diamond_boots");
    expect(findRecipe(grid(["X.X", "X.X", "..."], "copper_ingot"))?.result).toBe("copper_boots");
  });

  it("refuse un motif incomplet ou des matériaux mélangés", () => {
    expect(findRecipe(grid(["XXX", "X..", "..."], "iron_ingot"))).toBeNull();
    const mixed = grid(["XXX", "X.X", "..."], "iron_ingot");
    mixed[0] = "gold_ingot";
    expect(findRecipe(mixed)).toBeNull();
    expect(findRecipe(Array(9).fill(null))).toBeNull();
    // Le minerai ne sert pas à fabriquer : il faut d'abord le cuire.
    expect(findRecipe(grid(["XXX", "X.X", "..."], "iron_ore"))).toBeNull();
  });

  it("lingot de netherite : 4 fragments + 4 lingots d'or, dans n'importe quel ordre", () => {
    const cells: (ItemId | null)[] = [
      "gold_ingot",
      "netherite_scrap",
      "gold_ingot",
      "netherite_scrap",
      null,
      "netherite_scrap",
      "gold_ingot",
      "netherite_scrap",
      "gold_ingot",
    ];
    expect(findRecipe(cells)?.result).toBe("netherite_ingot");
    cells[0] = null;
    expect(findRecipe(cells)).toBeNull();
  });

  it("pièce de netherite : la pièce en diamant + 1 lingot de netherite", () => {
    const cells: (ItemId | null)[] = Array(9).fill(null);
    cells[4] = "diamond_chestplate";
    cells[5] = "netherite_ingot";
    expect(findRecipe(cells)?.result).toBe("netherite_chestplate");
    cells[4] = "iron_chestplate";
    expect(findRecipe(cells)).toBeNull();
  });

  it("fabriquer utilise un objet par case et range le résultat dans le sac", () => {
    const inv = withCraft(grid(["XXX", "X.X", "..."], "iron_ingot"), 2);
    const made = craft(inv);
    expect(made).toEqual({ item: "iron_helmet", count: 1, durability: 50 });
    expect(inv.bag[0]).toEqual(made);
    expect(inv.craft.filter(Boolean).every((s) => s!.count === 1)).toBe(true);
    craft(inv);
    expect(inv.craft.every((s) => s === null)).toBe(true);
    expect(() => craft(inv)).toThrow(InventoryError);
  });

  it("refuse de fabriquer quand le sac est plein", () => {
    const inv = withCraft(grid(["XXX", "X.X", "..."], "iron_ingot"));
    inv.bag = inv.bag.map(() => newStack("iron_boots"));
    expect(() => craft(inv)).toThrow("full");
    expect(inv.craft[0]?.count).toBe(1); // rien n'a été consommé
  });
});

describe("déplacements", () => {
  it("pose, complète une pile et échange", () => {
    const inv = emptyInventory();
    inv.bag[0] = newStack("coal", 60);
    inv.bag[1] = newStack("coal", 10);
    moveItem(inv, { area: "bag", slot: 1 }, { area: "bag", slot: 0 });
    expect(inv.bag[0]?.count).toBe(64);
    expect(inv.bag[1]?.count).toBe(6);

    moveItem(inv, { area: "bag", slot: 1 }, { area: "craft", slot: 4 }, 1);
    expect(inv.craft[4]?.count).toBe(1);
    expect(inv.bag[1]?.count).toBe(5);

    inv.bag[2] = newStack("leather", 3);
    moveItem(inv, { area: "bag", slot: 2 }, { area: "bag", slot: 1 });
    expect(inv.bag[1]?.item).toBe("leather");
    expect(inv.bag[2]?.item).toBe("coal");
  });

  it("l'armure ne va que dans sa case ; le four n'accepte que minerai et charbon", () => {
    const inv = emptyInventory();
    inv.bag[0] = newStack("iron_helmet");
    inv.bag[1] = newStack("leather", 2);
    expect(() => moveItem(inv, { area: "bag", slot: 0 }, { area: "armor", slot: 1 })).toThrow(
      "not_allowed",
    );
    moveItem(inv, { area: "bag", slot: 0 }, { area: "armor", slot: 0 });
    expect(inv.armor[0]?.item).toBe("iron_helmet");
    expect(() => moveItem(inv, { area: "bag", slot: 1 }, { area: "furnace_in", slot: 0 })).toThrow(
      "not_allowed",
    );
    expect(() =>
      moveItem(inv, { area: "bag", slot: 1 }, { area: "furnace_fuel", slot: 0 }),
    ).toThrow("not_allowed");
    expect(() => moveItem(inv, { area: "bag", slot: 1 }, { area: "furnace_out", slot: 0 })).toThrow(
      "not_allowed",
    );
  });

  it("rangement automatique : équipe l'armure (en échangeant), envoie minerai et charbon au four", () => {
    const inv = emptyInventory();
    inv.armor[0] = newStack("leather_helmet");
    inv.bag[0] = newStack("iron_helmet");
    inv.bag[1] = newStack("iron_ore", 5);
    inv.bag[2] = newStack("coal", 3);
    moveItem(inv, { area: "bag", slot: 0 }, { area: "bag", slot: -1 });
    expect(inv.armor[0]?.item).toBe("iron_helmet");
    expect(inv.bag[0]?.item).toBe("leather_helmet");
    moveItem(inv, { area: "bag", slot: 1 }, { area: "bag", slot: -1 });
    moveItem(inv, { area: "bag", slot: 2 }, { area: "bag", slot: -1 });
    expect(inv.furnace_in[0]).toMatchObject({ item: "iron_ore", count: 5 });
    expect(inv.furnace_fuel[0]).toMatchObject({ item: "coal", count: 3 });
    moveItem(inv, { area: "armor", slot: 0 }, { area: "bag", slot: -1 });
    expect(inv.armor[0]).toBeNull();
  });

  it("refuse une case inexistante ou vide", () => {
    const inv = emptyInventory();
    expect(() => moveItem(inv, { area: "bag", slot: 0 }, { area: "bag", slot: 1 })).toThrow(
      "empty_slot",
    );
    inv.bag[0] = newStack("coal");
    expect(() => moveItem(inv, { area: "bag", slot: 0 }, { area: "bag", slot: 27 })).toThrow(
      "bad_slot",
    );
  });

  it("le sac range sur les piles existantes avant les cases vides", () => {
    const inv = emptyInventory();
    inv.bag[3] = newStack("coal", 62);
    expect(addToBag(inv, newStack("coal", 4))).toBe(4);
    expect(inv.bag[3]?.count).toBe(64);
    expect(inv.bag[0]?.count).toBe(2);
    expect(bagFits(inv, "coal", 64 * 25 + 62)).toBe(true);
    expect(bagFits(inv, "coal", 64 * 25 + 63)).toBe(false);
  });
});

describe("four", () => {
  function furnace(ore: number, coal: number): Inventory {
    const inv = emptyInventory();
    if (ore) inv.furnace_in[0] = newStack("iron_ore", ore);
    if (coal) inv.furnace_fuel[0] = newStack("coal", coal);
    return inv;
  }

  it("cuit un minerai toutes les 10 s, même page fermée", () => {
    const inv = furnace(3, 1);
    expect(settleFurnace(inv, SMELT_MS * 2 + 4_000)).toBe(2);
    expect(inv.furnace_out[0]).toMatchObject({ item: "iron_ingot", count: 2 });
    expect(inv.furnace.progressMs).toBe(4_000);
    expect(inv.furnace_fuel[0]).toBeNull(); // le charbon brûle
    expect(inv.furnace.burnLeft).toBe(6);
    expect(furnaceActive(inv)).toBe(true);
  });

  it("un charbon fait 8 cuissons", () => {
    const inv = furnace(20, 2);
    expect(settleFurnace(inv, SMELT_MS * 100)).toBe(16);
    expect(inv.furnace_in[0]?.count).toBe(4);
    expect(furnaceActive(inv)).toBe(false);
  });

  it("s'arrête sans combustible, sans minerai, ou si la sortie est pleine ou différente", () => {
    expect(settleFurnace(furnace(3, 0), SMELT_MS * 5)).toBe(0);
    expect(settleFurnace(furnace(0, 3), SMELT_MS * 5)).toBe(0);
    const inv = furnace(3, 1);
    inv.furnace_out[0] = newStack("gold_ingot", 1);
    expect(settleFurnace(inv, SMELT_MS * 5)).toBe(0);
    expect(inv.furnace_fuel[0]?.count).toBe(1); // le charbon n'est pas gaspillé
    const debris = emptyInventory();
    debris.furnace_in[0] = newStack("ancient_debris", 1);
    debris.furnace_fuel[0] = newStack("coal", 1);
    settleFurnace(debris, SMELT_MS);
    expect(debris.furnace_out[0]?.item).toBe("netherite_scrap");
  });
});

describe("effets de l'équipement", () => {
  const set = (material: string) =>
    ["helmet", "chestplate", "leggings", "boots"].map((p) =>
      newStack(`${material}_${p}` as ItemId),
    );

  it("esquive par pièce, +5 % pour l'armure complète, maximum 37 % en netherite", () => {
    expect(computeLoadout(set("netherite"), null).dodge).toBe(0.37);
    expect(computeLoadout(set("leather"), null).dodge).toBe(0.13);
    const mixed = [newStack("iron_helmet"), null, newStack("diamond_leggings"), null];
    expect(computeLoadout(mixed, null)).toMatchObject({ dodge: 0.1, xpBonus: 0 });
  });

  it("l'or donne de l'XP : +5 % par pièce, +30 % pour l'armure complète", () => {
    expect(computeLoadout(set("gold"), null)).toMatchObject({ dodge: 0.12, xpBonus: 0.3 });
    expect(computeLoadout([newStack("gold_helmet"), null, null, null], null).xpBonus).toBe(0.05);
  });

  it("objets à usage unique", () => {
    const none = [null, null, null, null];
    expect(computeLoadout(none, "enchanted_golden_apple")).toMatchObject({
      immuneAll: true,
      item: "enchanted_golden_apple",
    });
    expect(computeLoadout(none, "night_vision")).toMatchObject({
      immuneFog: true,
      immuneAll: false,
    });
    expect(computeLoadout(none, "shield").shield).toBe(1);
    expect(computeLoadout(none, "totem").noLevelLoss).toBe(true);
    expect(computeLoadout(set("gold"), "xp_bottle").xpBonus).toBe(0.8);
    expect(computeLoadout(none, "coal").item).toBeNull();
  });

  it("l'armure s'use d'une course à la fois et se brise à 0", () => {
    const inv = emptyInventory();
    inv.armor[0] = { ...newStack("leather_helmet"), durability: 2 };
    inv.armor[3] = newStack("netherite_boots");
    expect(wearArmor(inv)).toEqual([]);
    expect(wearArmor(inv)).toEqual(["leather_helmet"]);
    expect(inv.armor[0]).toBeNull();
    expect(inv.armor[3]?.durability).toBe(148);
  });
});

describe("charbon au podium", () => {
  const always = () => 0;
  const never = () => 0.99;

  it("seulement sur le podium d'une course finie, avec au moins un adversaire", () => {
    expect(podiumCoal(1, true, 1, always)).toBe(1);
    expect(podiumCoal(3, true, 5, always)).toBe(1);
    expect(podiumCoal(4, true, 5, always)).toBe(0);
    expect(podiumCoal(1, false, 3, always)).toBe(0);
    expect(podiumCoal(1, true, 0, always)).toBe(0);
    expect(podiumCoal(1, true, 3, never)).toBe(0);
  });

  it("plus on finit haut, meilleure est la chance (60 %, 40 %, 25 %) ; le 1er peut en gagner 2", () => {
    const at = (value: number) => () => value;
    expect(podiumCoal(1, true, 1, at(0.59))).toBe(2);
    expect(podiumCoal(2, true, 1, at(0.39))).toBe(1);
    expect(podiumCoal(2, true, 1, at(0.45))).toBe(0);
    expect(podiumCoal(3, true, 1, at(0.3))).toBe(0);
  });
});

describe("boutique", () => {
  it("6 offres sans doublon, les mêmes toute la journée, différentes d'un compte à l'autre", () => {
    const a = generateOffers("user-a", "2026-10-16");
    expect(a).toHaveLength(6);
    expect(new Set(a.map((o) => o.item)).size).toBe(6);
    expect(generateOffers("user-a", "2026-10-16")).toEqual(a);
    expect(generateOffers("user-b", "2026-10-16")).not.toEqual(a);
    expect(generateOffers("user-a", "2026-10-17")).not.toEqual(a);
  });

  it("jamais de netherite, et des raretés à peu près dans les bonnes proportions", () => {
    const counts = { common: 0, uncommon: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 2000; i++) {
      for (const o of generateOffers(`u${i}`, "2026-10-16")) {
        counts[o.rarity]++;
        expect(o.item.startsWith("netherite")).toBe(false);
        expect(ITEM_IDS).toContain(o.item);
        expect(o.price).toBeGreaterThan(0);
      }
    }
    const total = 12_000;
    // Sans doublon, les offres communes (4 objets seulement) sont un peu moins fréquentes que 60 %.
    expect(counts.common / total).toBeGreaterThan(0.45);
    expect(counts.uncommon / total).toBeGreaterThan(0.2);
    expect(counts.rare / total).toBeGreaterThan(0.1);
    expect(counts.epic / total).toBeGreaterThan(0.02);
    expect(counts.epic / total).toBeLessThan(0.06);
  });

  it("le jour change à minuit, heure de Toronto (changement d'heure compris)", () => {
    expect(shopDay(new Date("2026-10-16T03:59:00Z"))).toBe("2026-10-15"); // 23 h 59 à Toronto
    expect(shopDay(new Date("2026-10-16T04:00:00Z"))).toBe("2026-10-16");
    expect(nextShopReset(new Date("2026-10-16T15:00:00Z")).toISOString()).toBe(
      "2026-10-17T04:00:00.000Z",
    );
    // Le 1er novembre 2026, on recule d'une heure : minuit suivant à 5 h UTC.
    expect(nextShopReset(new Date("2026-11-01T12:00:00Z")).toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });
});

describe("jeter un objet", () => {
  it("rend 25 % de sa valeur, arrondi vers le bas", () => {
    expect(itemValue("diamond")).toBe(60);
    expect(discardXp("diamond", 1, null)).toBe(15);
    expect(discardXp("coal", 1, null)).toBe(0); // 2,5 XP la pièce : un seul ne rapporte rien
    expect(discardXp("coal", 4, null)).toBe(2);
    expect(itemValue("iron_helmet")).toBe(65); // 5 lingots de fer
    expect(discardXp("iron_helmet", 1, 50)).toBe(16);
    expect(itemValue("netherite_ingot")).toBe(676); // 4 fragments + 4 lingots d'or
    expect(itemValue("netherite_boots")).toBe(4 * 60 + 676);
  });

  it("une armure usée rend moins", () => {
    expect(discardXp("diamond_chestplate", 1, 50)).toBe(Math.floor(0.25 * 480 * 0.5));
    expect(discardXp("diamond_chestplate", 1, 100)).toBe(120);
  });

  it("n'est jamais rentable : on récupère moins que le prix payé", () => {
    for (const id of ITEM_IDS) {
      const price = shopPrice(id);
      if (price) expect(discardXp(id, price.count, null)).toBeLessThan(price.price);
    }
  });
});
