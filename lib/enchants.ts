// Table d'enchantement (fonctionnalité ajoutée, règles validées par l'étudiant le 16 oct. 2026).
// Pas d'enclume : une pièce d'armure s'enchante une seule fois, au hasard, et c'est définitif. Trois choix
// (1, 2 ou 3 niveaux) montrent chacun un indice ; le tirage est déterministe (graine du compte), donc
// l'indice affiché est vraiment le premier enchantement obtenu. Logique pure, testée.
import { createRng } from "@/lib/text/rng";
import { armorInfo, type ArmorPart, type ItemId, type Material } from "./items";
import { levelFromXp, totalXpForLevel, xpToNextLevel } from "./xp";

export const ENCHANT_IDS = [
  "protection",
  "unbreaking",
  "mending",
  "respiration",
  "feather_falling",
  "thorns",
  "fortune",
  "binding_curse",
  "vanishing_curse",
] as const;
export type EnchantId = (typeof ENCHANT_IDS)[number];
export type Enchant = { id: EnchantId; level: number };

type EnchantRule = {
  max: number;
  /** Pièces qui peuvent l'avoir (toutes si absent). */
  parts?: readonly ArmorPart[];
  /** Poids du tirage : plus il est grand, plus l'enchantement est fréquent. */
  weight: number;
  curse?: true;
};

export const ENCHANT_RULES: Record<EnchantId, EnchantRule> = {
  protection: { max: 4, weight: 10 },
  unbreaking: { max: 3, weight: 5 },
  mending: { max: 1, weight: 1 },
  respiration: { max: 3, weight: 3, parts: ["helmet"] },
  feather_falling: { max: 4, weight: 5, parts: ["boots"] },
  thorns: { max: 3, weight: 2, parts: ["chestplate"] },
  fortune: { max: 3, weight: 3, parts: ["leggings"] },
  binding_curse: { max: 1, weight: 1, curse: true },
  vanishing_curse: { max: 1, weight: 1, curse: true },
};

export function isEnchantId(value: unknown): value is EnchantId {
  return typeof value === "string" && (ENCHANT_IDS as readonly string[]).includes(value);
}

export function isCurse(id: EnchantId): boolean {
  return !!ENCHANT_RULES[id].curse;
}

// ---- Effets ----

export const PROTECTION_DODGE_PER_LEVEL = 0.01;
export const UNBREAKING_SAVE = [0, 0.2, 0.35, 0.5] as const;
export const RESPIRATION_FOG_MS_PER_LEVEL = 1_000;
export const FEATHER_BLOCK_PER_LEVEL = 0.04;
export const THORNS_PER_LEVEL = 0.1;
export const THORNS_FOG_MS = 2_000;
export const FORTUNE_XP_PER_LEVEL = 0.03;
export const MAX_ENCHANTS = 3;
export const CURSE_CHANCE = 0.1;

export function enchantLevel(
  enchants: readonly Enchant[] | null | undefined,
  id: EnchantId,
): number {
  return enchants?.find((e) => e.id === id)?.level ?? 0;
}

/** Relit une liste d'enchantements venue de la base (mal formée : ignorée). */
export function parseEnchants(value: unknown): Enchant[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e: unknown) => {
    const { id, level } = (e ?? {}) as { id?: unknown; level?: unknown };
    if (!isEnchantId(id) || typeof level !== "number") return [];
    const max = ENCHANT_RULES[id].max;
    return [{ id, level: Math.min(max, Math.max(1, Math.floor(level))) }];
  });
}

// ---- Choix de la table ----

/** Facilité d'enchantement par matériau (comme Minecraft : l'or est le meilleur). */
export const ENCHANTABILITY: Record<Material, number> = {
  leather: 15,
  copper: 10,
  iron: 9,
  gold: 25,
  diamond: 10,
  netherite: 15,
};

export type EnchantOption = {
  /** Niveaux payés (1, 2 ou 3). */
  cost: number;
  /** Niveau minimum pour choisir cette option. */
  minLevel: number;
  /** Premier enchantement obtenu, montré comme indice. */
  hint: Enchant;
};

export const OPTION_COST = [1, 2, 3] as const;
export const OPTION_MIN_LEVEL = [5, 15, 30] as const;
/** Niveau d'enchantement maximal de chaque choix (le 3e va jusqu'au maximum de l'enchantement). */
const OPTION_LEVEL_CAP = [2, 3, 99] as const;

function applicable(part: ArmorPart): EnchantId[] {
  return ENCHANT_IDS.filter((id) => {
    const rule = ENCHANT_RULES[id];
    return !rule.curse && (!rule.parts || rule.parts.includes(part));
  });
}

function pickWeighted(ids: EnchantId[], rng: () => number): EnchantId {
  const total = ids.reduce((sum, id) => sum + ENCHANT_RULES[id].weight, 0);
  let roll = rng() * total;
  for (const id of ids) {
    roll -= ENCHANT_RULES[id].weight;
    if (roll < 0) return id;
  }
  return ids.at(-1)!;
}

/**
 * Résultat d'un choix pour une pièce et une graine : 1 enchantement (choix 1), 1 ou 2 (choix 2), 1 à 3
 * (choix 3), plus une chance de malédiction. Les matériaux faciles à enchanter (or, cuir) ont plus
 * d'enchantements et de meilleurs niveaux.
 */
export function rollEnchants(item: ItemId, seed: number, option: number): Enchant[] {
  const info = armorInfo(item);
  if (!info || option < 0 || option > 2) return [];
  const rng = createRng((seed ^ Math.imul(option + 1, 0x9e3779b1) ^ hash(item)) >>> 0);
  const bonus = ENCHANTABILITY[info.material] / 50; // 0,18 (fer) à 0,5 (or)

  let count = 1;
  if (option === 1 && rng() < 0.4 + bonus) count = 2;
  if (option === 2) {
    if (rng() < 0.5 + bonus) count++;
    if (rng() < 0.2 + bonus) count++;
  }

  const pool = applicable(info.part);
  const result: Enchant[] = [];
  while (result.length < count && pool.length > 0) {
    const id = pickWeighted(pool, rng);
    pool.splice(pool.indexOf(id), 1);
    const cap = Math.min(ENCHANT_RULES[id].max, OPTION_LEVEL_CAP[option]!);
    let level = 1 + Math.floor(rng() * cap);
    if (level < cap && rng() < bonus) level++; // matériau facile à enchanter : un niveau de plus
    result.push({ id, level });
  }

  // La malchance : une malédiction s'ajoute (ou remplace le dernier si la pièce en a déjà 3).
  if (rng() < CURSE_CHANCE) {
    const curse: EnchantId = rng() < 0.5 ? "binding_curse" : "vanishing_curse";
    if (result.length >= MAX_ENCHANTS) result.pop();
    result.push({ id: curse, level: 1 });
  }
  return result;
}

/** Les trois choix de la table pour cette pièce (indice = premier enchantement du tirage). */
export function enchantOptions(item: ItemId, seed: number): EnchantOption[] {
  if (!armorInfo(item)) return [];
  return OPTION_COST.map((cost, i) => ({
    cost,
    minLevel: OPTION_MIN_LEVEL[i]!,
    hint: rollEnchants(item, seed, i)[0]!,
  }));
}

/** XP retirée pour payer `levels` niveaux : la barre garde son pourcentage (comme l'abandon). */
export function levelCostXp(totalXp: number, levels: number): number {
  const { level, fraction } = levelFromXp(totalXp);
  const target = Math.max(0, level - levels);
  const after = totalXpForLevel(target) + Math.floor(fraction * xpToNextLevel(target));
  return Math.max(0, Math.floor(totalXp) - after);
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Chiffres romains des niveaux (I à IV). */
export function roman(level: number): string {
  return ["", "I", "II", "III", "IV", "V"][level] ?? String(level);
}
