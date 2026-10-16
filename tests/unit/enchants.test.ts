import { describe, expect, it } from "vitest";
import {
  CURSE_CHANCE,
  ENCHANT_RULES,
  enchantOptions,
  isCurse,
  levelCostXp,
  MAX_ENCHANTS,
  parseEnchants,
  rollEnchants,
  roman,
} from "@/lib/enchants";
import {
  computeLoadout,
  emptyInventory,
  InventoryError,
  MAX_DODGE,
  mendArmor,
  moveItem,
  newStack,
  vanishArmor,
  wearArmor,
} from "@/lib/inventory";
import { armorInfo, type ItemId } from "@/lib/items";
import { levelFromXp, totalXpForLevel } from "@/lib/xp";

const PIECES: ItemId[] = ["iron_helmet", "diamond_chestplate", "gold_leggings", "leather_boots"];

describe("tirage de la table d'enchantement", () => {
  it("est déterministe, et l'indice affiché est le premier enchantement obtenu", () => {
    for (let seed = 1; seed < 200; seed++) {
      for (const item of PIECES) {
        const options = enchantOptions(item, seed);
        expect(options.map((o) => [o.cost, o.minLevel])).toEqual([
          [1, 5],
          [2, 15],
          [3, 30],
        ]);
        options.forEach((o, i) => {
          expect(rollEnchants(item, seed, i)).toEqual(rollEnchants(item, seed, i));
          expect(rollEnchants(item, seed, i)[0]).toEqual(o.hint);
        });
      }
    }
  });

  it("respecte les pièces, les niveaux maximums et 3 enchantements au plus, sans doublon", () => {
    for (let seed = 1; seed < 2000; seed++) {
      for (const item of PIECES) {
        const part = armorInfo(item)!.part;
        for (let option = 0; option < 3; option++) {
          const result = rollEnchants(item, seed, option);
          expect(result.length).toBeGreaterThanOrEqual(1);
          expect(result.length).toBeLessThanOrEqual(MAX_ENCHANTS);
          expect(new Set(result.map((e) => e.id)).size).toBe(result.length);
          for (const e of result) {
            const rule = ENCHANT_RULES[e.id];
            expect(e.level).toBeGreaterThanOrEqual(1);
            expect(e.level).toBeLessThanOrEqual(rule.max);
            if (rule.parts) expect(rule.parts).toContain(part);
            if (option === 0 && !isCurse(e.id)) expect(e.level).toBeLessThanOrEqual(2);
            if (option === 1 && !isCurse(e.id)) expect(e.level).toBeLessThanOrEqual(3);
          }
          if (option === 0) expect(result.filter((e) => !isCurse(e.id)).length).toBe(1);
        }
      }
    }
  });

  it("environ 10 % de malédictions, et le 3e choix peut donner Protection IV", () => {
    let cursed = 0;
    let total = 0;
    let protection4 = false;
    for (let seed = 1; seed < 3000; seed++) {
      const result = rollEnchants("diamond_chestplate", seed, 2);
      total++;
      if (result.some((e) => isCurse(e.id))) cursed++;
      if (result.some((e) => e.id === "protection" && e.level === 4)) protection4 = true;
    }
    expect(cursed / total).toBeGreaterThan(CURSE_CHANCE - 0.03);
    expect(cursed / total).toBeLessThan(CURSE_CHANCE + 0.03);
    expect(protection4).toBe(true);
  });

  it("l'or a plus d'enchantements que le fer (comme dans Minecraft)", () => {
    const count = (item: ItemId) => {
      let n = 0;
      for (let seed = 1; seed < 2000; seed++) n += rollEnchants(item, seed, 2).length;
      return n;
    };
    expect(count("gold_helmet")).toBeGreaterThan(count("iron_helmet"));
  });

  it("refuse ce qui n'est pas de l'armure", () => {
    expect(rollEnchants("diamond", 1, 2)).toEqual([]);
    expect(enchantOptions("coal", 1)).toEqual([]);
  });

  it("payer des niveaux garde le pourcentage de la barre", () => {
    const xp = totalXpForLevel(30) + 56; // niveau 30, moitié de la barre
    const after = xp - levelCostXp(xp, 3);
    expect(levelFromXp(after).level).toBe(27);
    expect(levelFromXp(after).fraction).toBeCloseTo(0.5, 1);
    expect(levelCostXp(10, 5)).toBe(8); // niveau 1 au tiers : on reste au tiers du niveau 0
  });

  it("relit les enchantements de la base en ignorant le reste", () => {
    expect(parseEnchants([{ id: "protection", level: 9 }, { id: "x", level: 1 }, null])).toEqual([
      { id: "protection", level: 4 },
    ]);
    expect(parseEnchants("pas une liste")).toEqual([]);
    expect(roman(4)).toBe("IV");
  });
});

describe("effets des enchantements", () => {
  it("Protection, Fortune, Respiration, Chute amortie et Épines dans l'équipement de course", () => {
    const armor = [
      {
        ...newStack("iron_helmet"),
        enchants: [
          { id: "respiration" as const, level: 3 },
          { id: "protection" as const, level: 2 },
        ],
      },
      { ...newStack("iron_chestplate"), enchants: [{ id: "thorns" as const, level: 2 }] },
      { ...newStack("iron_leggings"), enchants: [{ id: "fortune" as const, level: 3 }] },
      { ...newStack("iron_boots"), enchants: [{ id: "feather_falling" as const, level: 4 }] },
    ];
    expect(computeLoadout(armor, null)).toMatchObject({
      dodge: 0.23, // 4 × 4 % + 5 % (armure complète) + 2 %
      xpBonus: 0.09,
      fogReductionMs: 3_000,
      plusWordsBlock: 0.16,
      thorns: 0.2,
    });
  });

  it("l'esquive ne dépasse jamais 50 %", () => {
    const armor = ["helmet", "chestplate", "leggings", "boots"].map((p) => ({
      ...newStack(`netherite_${p}` as ItemId),
      enchants: [{ id: "protection" as const, level: 4 }],
    }));
    expect(computeLoadout(armor, null).dodge).toBe(MAX_DODGE);
  });

  it("Solidité évite parfois l'usure, Réparation répare, Disparition fait disparaître à l'abandon", () => {
    const inv = emptyInventory();
    inv.armor[0] = {
      ...newStack("iron_helmet"),
      durability: 10,
      enchants: [{ id: "unbreaking", level: 3 }],
    };
    inv.armor[1] = {
      ...newStack("iron_chestplate"),
      durability: 10,
      enchants: [{ id: "mending", level: 1 }],
    };
    inv.armor[2] = {
      ...newStack("iron_leggings"),
      enchants: [{ id: "vanishing_curse", level: 1 }],
    };
    wearArmor(inv, () => 0.1); // 0,1 < 50 % : le casque ne s'use pas
    expect(inv.armor[0]?.durability).toBe(10);
    expect(inv.armor[1]?.durability).toBe(9);
    wearArmor(inv, () => 0.9);
    expect(inv.armor[0]?.durability).toBe(9);
    mendArmor(inv);
    expect(inv.armor[1]?.durability).toBe(9);
    expect(vanishArmor(inv)).toEqual(["iron_leggings"]);
    expect(inv.armor[2]).toBeNull();
  });

  it("Malédiction du lien : la pièce portée ne se retire plus et ne se remplace plus (message clair)", () => {
    const cursed = emptyInventory();
    cursed.armor[0] = { ...newStack("iron_helmet"), enchants: [{ id: "binding_curse", level: 1 }] };
    expect(() => moveItem(cursed, { area: "armor", slot: 0 }, { area: "bag", slot: 0 })).toThrow(
      "bound",
    );
    const inv = emptyInventory();
    inv.armor[0] = { ...newStack("iron_helmet"), enchants: [{ id: "binding_curse", level: 1 }] };
    inv.bag[0] = newStack("diamond_helmet");
    expect(() => moveItem(inv, { area: "armor", slot: 0 }, { area: "bag", slot: 1 })).toThrow(
      InventoryError,
    );
    expect(() => moveItem(inv, { area: "armor", slot: 0 }, { area: "bag", slot: -1 })).toThrow(
      InventoryError,
    );
    expect(() => moveItem(inv, { area: "bag", slot: 0 }, { area: "armor", slot: 0 })).toThrow(
      InventoryError,
    );
    expect(() => moveItem(inv, { area: "bag", slot: 0 }, { area: "bag", slot: -1 })).toThrow(
      InventoryError,
    );
  });

  it("la table n'accepte qu'une pièce d'armure pas encore enchantée, et l'enchantement suit la pièce", () => {
    const inv = emptyInventory();
    inv.bag[0] = newStack("iron_ingot");
    inv.bag[1] = { ...newStack("iron_boots"), enchants: [{ id: "protection", level: 1 }] };
    inv.bag[2] = newStack("gold_boots");
    expect(() => moveItem(inv, { area: "bag", slot: 0 }, { area: "enchant", slot: 0 })).toThrow(
      "not_allowed",
    );
    expect(() => moveItem(inv, { area: "bag", slot: 1 }, { area: "enchant", slot: 0 })).toThrow(
      "already_enchanted",
    );
    moveItem(inv, { area: "bag", slot: 2 }, { area: "enchant", slot: 0 });
    expect(inv.enchant[0]?.item).toBe("gold_boots");
    moveItem(inv, { area: "bag", slot: 1 }, { area: "armor", slot: 3 });
    expect(inv.armor[3]?.enchants).toEqual([{ id: "protection", level: 1 }]);
  });
});
