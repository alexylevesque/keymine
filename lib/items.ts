// Inventaire, boutique, craft et four (fonctionnalité ajoutée, hors cahier des charges, validée par
// l'étudiant le 16 oct. 2026). Ce fichier est le catalogue : objets, raretés, prix en XP, armures et
// objets à usage unique. Logique pure, partagée entre le serveur, le client et les tests.

export const MATERIALS = ["leather", "copper", "iron", "gold", "diamond", "netherite"] as const;
export type Material = (typeof MATERIALS)[number];

/** Emplacements d'armure, dans l'ordre des cases (0 = tête … 3 = pieds). */
export const ARMOR_PARTS = ["helmet", "chestplate", "leggings", "boots"] as const;
export type ArmorPart = (typeof ARMOR_PARTS)[number];

export const RESOURCES = [
  "coal",
  "leather",
  "copper_ore",
  "iron_ore",
  "gold_ore",
  "copper_ingot",
  "iron_ingot",
  "gold_ingot",
  "diamond",
  "ancient_debris",
  "netherite_scrap",
  "netherite_ingot",
] as const;
export type Resource = (typeof RESOURCES)[number];

/** Objets à usage unique : on en active un dans l'inventaire, il agit pendant la prochaine course. */
export const CONSUMABLES = [
  "enchanted_golden_apple",
  "totem",
  "xp_bottle",
  "shield",
  "night_vision",
] as const;
export type Consumable = (typeof CONSUMABLES)[number];

export type ArmorId = `${Material}_${ArmorPart}`;
export const ARMOR_IDS: ArmorId[] = MATERIALS.flatMap((m) =>
  ARMOR_PARTS.map((p) => `${m}_${p}` as const),
);

export type ItemId = Resource | Consumable | ArmorId;
export const ITEM_IDS: readonly ItemId[] = [...RESOURCES, ...CONSUMABLES, ...ARMOR_IDS];

export function isItemId(value: unknown): value is ItemId {
  return typeof value === "string" && (ITEM_IDS as readonly string[]).includes(value);
}

export type Rarity = "common" | "uncommon" | "rare" | "epic";

export const MAX_STACK = 64;

// ---- Armure ----

/** Matériaux nécessaires pour une pièce (recettes 3 × 3 de Minecraft). */
export const PART_COST: Record<ArmorPart, number> = {
  helmet: 5,
  chestplate: 8,
  leggings: 7,
  boots: 4,
};

/** Chance d'esquiver un malus, par pièce portée (0,03 = 3 %). */
export const DODGE_PER_PIECE: Record<Material, number> = {
  leather: 0.02,
  copper: 0.03,
  iron: 0.04,
  gold: 0.03,
  diamond: 0.06,
  netherite: 0.08,
};
/** Armure complète d'un même matériau : +5 % d'esquive (l'or donne plutôt +10 % d'XP). */
export const FULL_SET_DODGE = 0.05;
/** L'or : +5 % d'XP par pièce, +10 % de plus pour l'armure complète. */
export const GOLD_XP_PER_PIECE = 0.05;
export const GOLD_FULL_SET_XP = 0.1;

/** Durabilité : nombre de courses avant que la pièce se brise. */
export const DURABILITY: Record<Material, number> = {
  leather: 20,
  copper: 30,
  iron: 50,
  gold: 25,
  diamond: 100,
  netherite: 150,
};

/** Matériau de fabrication de chaque armure (netherite : se fait à partir du diamant). */
export const ARMOR_MATERIAL_ITEM: Record<Material, Resource> = {
  leather: "leather",
  copper: "copper_ingot",
  iron: "iron_ingot",
  gold: "gold_ingot",
  diamond: "diamond",
  netherite: "netherite_ingot",
};

export function armorInfo(
  id: ItemId,
): { material: Material; part: ArmorPart; slot: number } | null {
  const [material, part] = id.split("_") as [string, string];
  if (!(MATERIALS as readonly string[]).includes(material)) return null;
  const slot = (ARMOR_PARTS as readonly string[]).indexOf(part);
  if (slot < 0) return null;
  return { material: material as Material, part: part as ArmorPart, slot };
}

export function isArmor(id: ItemId): id is ArmorId {
  return armorInfo(id) !== null;
}

export function isConsumable(id: ItemId): id is Consumable {
  return (CONSUMABLES as readonly string[]).includes(id);
}

/** Taille maximale d'une pile : 1 pour l'armure et les objets « uniques », 64 sinon. */
export function maxStack(id: ItemId): number {
  if (isArmor(id)) return 1;
  if (id === "totem" || id === "shield" || id === "night_vision") return 1;
  return MAX_STACK;
}

export function maxDurability(id: ItemId): number | null {
  const armor = armorInfo(id);
  return armor ? DURABILITY[armor.material] : null;
}

// ---- Prix et raretés (boutique) ----

/** Coût de référence d'une unité de matériau, pour le prix des pièces « déjà faites ». */
const MATERIAL_UNIT_XP: Record<Exclude<Material, "netherite">, number> = {
  leather: 8,
  copper: 7,
  iron: 13,
  gold: 19,
  diamond: 60,
};
/** Une pièce déjà faite coûte environ 70 % de ses matériaux. */
export const READY_MADE_RATIO = 0.7;

export function readyMadePrice(id: ArmorId): number {
  const info = armorInfo(id)!;
  if (info.material === "netherite") throw new Error("La netherite ne se vend jamais déjà faite.");
  return Math.round(READY_MADE_RATIO * PART_COST[info.part] * MATERIAL_UNIT_XP[info.material]);
}

export type ShopEntry = { item: ItemId | "random_armor"; count: number; price: number };

/** Ce que la boutique peut proposer, par rareté (prix en XP pour le lot). */
export const SHOP_POOLS: Record<Rarity, readonly ShopEntry[]> = {
  common: [
    { item: "coal", count: 4, price: 10 },
    { item: "leather", count: 1, price: 8 },
    { item: "copper_ore", count: 1, price: 6 },
    { item: "iron_ore", count: 1, price: 12 },
  ],
  uncommon: [
    { item: "gold_ore", count: 1, price: 18 },
    { item: "iron_ingot", count: 1, price: 18 },
    { item: "gold_ingot", count: 1, price: 26 },
    { item: "shield", count: 1, price: 40 },
    { item: "night_vision", count: 1, price: 35 },
  ],
  rare: [
    { item: "diamond", count: 1, price: 60 },
    { item: "ancient_debris", count: 1, price: 150 },
    { item: "totem", count: 1, price: 120 },
    { item: "xp_bottle", count: 1, price: 100 },
  ],
  epic: [
    { item: "random_armor", count: 1, price: 0 }, // prix de la pièce tirée (readyMadePrice)
    { item: "enchanted_golden_apple", count: 1, price: 250 },
  ],
};

/** Chances de chaque rareté pour une offre (somme = 1). */
export const RARITY_WEIGHTS: readonly [Rarity, number][] = [
  ["common", 0.6],
  ["uncommon", 0.25],
  ["rare", 0.12],
  ["epic", 0.03],
];

/** Nombre d'achats permis par offre et par jour, selon la rareté. */
export const RARITY_STOCK: Record<Rarity, number> = { common: 8, uncommon: 4, rare: 2, epic: 1 };

export const OFFERS_PER_DAY = 6;

/** Rareté d'un objet (pour la fiche d'information) ; null s'il ne se vend pas tel quel. */
export function rarityOf(id: ItemId): Rarity | null {
  for (const [rarity, entries] of Object.entries(SHOP_POOLS) as [Rarity, readonly ShopEntry[]][]) {
    if (entries.some((e) => e.item === id)) return rarity;
  }
  const armor = armorInfo(id);
  if (armor && armor.material !== "netherite") return "epic";
  return null;
}

/** Prix d'une unité en boutique (null si l'objet ne s'achète pas). */
export function shopPrice(id: ItemId): { count: number; price: number } | null {
  for (const entries of Object.values(SHOP_POOLS)) {
    const entry = entries.find((e) => e.item === id);
    if (entry) return { count: entry.count, price: entry.price };
  }
  const armor = armorInfo(id);
  if (armor && armor.material !== "netherite")
    return { count: 1, price: readyMadePrice(id as ArmorId) };
  return null;
}

// ---- Objets à usage unique ----

export const CONSUMABLE_EFFECT: Record<
  Consumable,
  { immuneAll?: true; immuneFog?: true; shield?: number; xpBonus?: number; noLevelLoss?: true }
> = {
  enchanted_golden_apple: { immuneAll: true },
  totem: { noLevelLoss: true },
  xp_bottle: { xpBonus: 0.5 },
  shield: { shield: 1 },
  night_vision: { immuneFog: true },
};

// ---- Charbon gagné au podium ----

/** Chance de gagner du charbon selon la place (1er, 2e, 3e), et nombre maximal de charbons. */
export const PODIUM_COAL: readonly { chance: number; max: number }[] = [
  { chance: 0.6, max: 2 },
  { chance: 0.4, max: 1 },
  { chance: 0.25, max: 1 },
];

/**
 * Charbon gagné en fin de course : seulement sur le podium d'une course finie (pas un abandon), avec au
 * moins un adversaire. `rng` renvoie un nombre dans [0, 1[.
 */
export function podiumCoal(
  rank: number,
  finished: boolean,
  opponents: number,
  rng: () => number,
): number {
  if (!finished || opponents < 1) return 0;
  const rule = PODIUM_COAL[rank - 1];
  if (!rule || rng() >= rule.chance) return 0;
  return 1 + Math.floor(rng() * rule.max);
}
