// Inventaire (fonctionnalité ajoutée) : cases, déplacements, table de craft 3 × 3, four et effets de
// l'équipement. Logique pure : le serveur charge l'inventaire, applique une opération d'ici, puis
// l'enregistre (lib/inventory-store.ts). Le client s'en sert pour afficher le résultat du craft.
import {
  ARMOR_MATERIAL_ITEM,
  ARMOR_PARTS,
  armorInfo,
  CONSUMABLE_EFFECT,
  DODGE_PER_PIECE,
  FULL_SET_DODGE,
  GOLD_FULL_SET_XP,
  GOLD_XP_PER_PIECE,
  isConsumable,
  MATERIALS,
  maxDurability,
  maxStack,
  type ArmorId,
  type ItemId,
  type Material,
} from "./items";

export const BAG_SIZE = 27;
export const CRAFT_SIZE = 9;
export const ARMOR_SIZE = 4;

export const AREAS = [
  "bag",
  "armor",
  "craft",
  "furnace_in",
  "furnace_fuel",
  "furnace_out",
] as const;
export type Area = (typeof AREAS)[number];

export const AREA_SIZE: Record<Area, number> = {
  bag: BAG_SIZE,
  armor: ARMOR_SIZE,
  craft: CRAFT_SIZE,
  furnace_in: 1,
  furnace_fuel: 1,
  furnace_out: 1,
};

export type Stack = { item: ItemId; count: number; durability: number | null };
export type Slot = Stack | null;

export type FurnaceState = {
  /** Cuissons restantes du charbon en train de brûler (un charbon = 8 cuissons). */
  burnLeft: number;
  /** Avancement de la cuisson en cours, en ms (10 s par objet). */
  progressMs: number;
};

export type Inventory = Record<Area, Slot[]> & { furnace: FurnaceState };

export function emptyInventory(): Inventory {
  return {
    bag: Array<Slot>(BAG_SIZE).fill(null),
    armor: Array<Slot>(ARMOR_SIZE).fill(null),
    craft: Array<Slot>(CRAFT_SIZE).fill(null),
    furnace_in: [null],
    furnace_fuel: [null],
    furnace_out: [null],
    furnace: { burnLeft: 0, progressMs: 0 },
  };
}

export function cloneInventory(inv: Inventory): Inventory {
  const copy = (slots: Slot[]) => slots.map((s) => (s ? { ...s } : null));
  return {
    bag: copy(inv.bag),
    armor: copy(inv.armor),
    craft: copy(inv.craft),
    furnace_in: copy(inv.furnace_in),
    furnace_fuel: copy(inv.furnace_fuel),
    furnace_out: copy(inv.furnace_out),
    furnace: { ...inv.furnace },
  };
}

export function newStack(item: ItemId, count = 1): Stack {
  return { item, count, durability: maxDurability(item) };
}

export class InventoryError extends Error {
  constructor(
    readonly code: "bad_slot" | "empty_slot" | "not_allowed" | "full" | "no_recipe" | "not_usable",
  ) {
    super(code);
  }
}

// ---- Four ----

export const SMELT_MS = 10_000;
export const SMELTS_PER_COAL = 8;

/** Ce que donne le four pour chaque minerai. */
export const SMELTING: Partial<Record<ItemId, ItemId>> = {
  copper_ore: "copper_ingot",
  iron_ore: "iron_ingot",
  gold_ore: "gold_ingot",
  ancient_debris: "netherite_scrap",
};

export function canSmelt(item: ItemId): boolean {
  return item in SMELTING;
}

/** Ce qu'une case accepte (l'armure : seulement sa pièce ; la sortie du four : rien). */
export function accepts(area: Area, slot: number, item: ItemId): boolean {
  switch (area) {
    case "armor":
      return armorInfo(item)?.slot === slot;
    case "furnace_in":
      return canSmelt(item);
    case "furnace_fuel":
      return item === "coal";
    case "furnace_out":
      return false;
    default:
      return true;
  }
}

/**
 * Fait avancer le four de `elapsedMs` (la cuisson continue page fermée : le serveur rattrape le temps
 * écoulé à chaque lecture). Modifie `inv` sur place et renvoie le nombre d'objets cuits.
 */
export function settleFurnace(inv: Inventory, elapsedMs: number): number {
  let left = Math.max(0, elapsedMs);
  let cooked = 0;
  const f = inv.furnace;
  for (;;) {
    const input = inv.furnace_in[0];
    const result = input ? SMELTING[input.item] : undefined;
    const out = inv.furnace_out[0];
    const outFits = result && (!out || (out.item === result && out.count < maxStack(result)));
    if (!input || !result || !outFits) {
      f.progressMs = 0;
      break;
    }
    if (f.burnLeft === 0) {
      const fuel = inv.furnace_fuel[0];
      if (!fuel) {
        f.progressMs = 0;
        break;
      }
      fuel.count -= 1;
      if (fuel.count === 0) inv.furnace_fuel[0] = null;
      f.burnLeft = SMELTS_PER_COAL;
    }
    const need = SMELT_MS - f.progressMs;
    if (left < need) {
      f.progressMs += left;
      break;
    }
    left -= need;
    f.progressMs = 0;
    f.burnLeft -= 1;
    input.count -= 1;
    if (input.count === 0) inv.furnace_in[0] = null;
    inv.furnace_out[0] = out ? { ...out, count: out.count + 1 } : newStack(result);
    cooked++;
  }
  return cooked;
}

/** Le four cuit-il en ce moment (pour l'animation et le rafraîchissement du client) ? */
export function furnaceActive(inv: Inventory): boolean {
  const input = inv.furnace_in[0];
  const result = input ? SMELTING[input.item] : undefined;
  if (!result) return false;
  const out = inv.furnace_out[0];
  if (out && (out.item !== result || out.count >= maxStack(result))) return false;
  return inv.furnace.burnLeft > 0 || inv.furnace_fuel[0] !== null;
}

// ---- Déplacements ----

export type SlotRef = { area: Area; slot: number };

function slotOf(inv: Inventory, ref: SlotRef): Slot {
  const slots = inv[ref.area];
  if (!Number.isInteger(ref.slot) || ref.slot < 0 || ref.slot >= slots.length) {
    throw new InventoryError("bad_slot");
  }
  return slots[ref.slot] ?? null;
}

/** Ajoute des objets dans le sac : d'abord sur les piles existantes, puis dans les cases vides. */
export function addToBag(inv: Inventory, stack: Stack): number {
  let rest = stack.count;
  const max = maxStack(stack.item);
  if (max > 1) {
    for (const s of inv.bag) {
      if (rest === 0) break;
      if (s && s.item === stack.item && s.count < max) {
        const moved = Math.min(rest, max - s.count);
        s.count += moved;
        rest -= moved;
      }
    }
  }
  for (let i = 0; i < inv.bag.length && rest > 0; i++) {
    if (!inv.bag[i]) {
      const moved = Math.min(rest, max);
      inv.bag[i] = { item: stack.item, count: moved, durability: stack.durability };
      rest -= moved;
    }
  }
  return stack.count - rest; // nombre réellement ajouté
}

/** Peut-on ranger tout ce lot dans le sac ? */
export function bagFits(inv: Inventory, item: ItemId, count: number): boolean {
  const max = maxStack(item);
  let room = 0;
  for (const s of inv.bag) {
    if (!s) room += max;
    else if (max > 1 && s.item === item) room += max - s.count;
    if (room >= count) return true;
  }
  return room >= count;
}

/**
 * Déplace `count` objets (tout par défaut) d'une case à une autre : pose dans une case vide, complète une
 * pile du même objet, ou échange deux piles entières. Sans `to.slot` défini (`slot: -1`) : rangement
 * automatique (vers le sac, ou vers l'armure pour une pièce portable).
 */
export function moveItem(inv: Inventory, from: SlotRef, to: SlotRef, count?: number): void {
  const source = slotOf(inv, from);
  if (!source) throw new InventoryError("empty_slot");
  const amount = Math.min(source.count, Math.max(1, Math.floor(count ?? source.count)));

  if (to.slot === -1) {
    autoMove(inv, from, source, amount);
    return;
  }
  if (from.area === to.area && from.slot === to.slot) return;
  const target = slotOf(inv, to);
  const slots = inv[to.area];

  if (!target) {
    if (!accepts(to.area, to.slot, source.item)) throw new InventoryError("not_allowed");
    slots[to.slot] = { ...source, count: amount };
    take(inv, from, amount);
    return;
  }
  if (target.item === source.item && maxStack(source.item) > 1) {
    if (!accepts(to.area, to.slot, source.item)) throw new InventoryError("not_allowed");
    const moved = Math.min(amount, maxStack(source.item) - target.count);
    if (moved <= 0) throw new InventoryError("full");
    target.count += moved;
    take(inv, from, moved);
    return;
  }
  // Échange : seulement des piles entières, et chacune doit être acceptée dans sa nouvelle case.
  if (amount !== source.count) throw new InventoryError("not_allowed");
  if (!accepts(to.area, to.slot, source.item) || !accepts(from.area, from.slot, target.item)) {
    throw new InventoryError("not_allowed");
  }
  slots[to.slot] = source;
  inv[from.area][from.slot] = target;
}

function take(inv: Inventory, from: SlotRef, amount: number) {
  const s = inv[from.area][from.slot]!;
  s.count -= amount;
  if (s.count <= 0) inv[from.area][from.slot] = null;
}

function autoMove(inv: Inventory, from: SlotRef, source: Stack, amount: number) {
  const armor = armorInfo(source.item);
  if (from.area === "bag" && armor) {
    // Équiper : échange avec la pièce déjà portée, s'il y en a une.
    const worn = inv.armor[armor.slot];
    inv.armor[armor.slot] = source;
    inv.bag[from.slot] = worn;
    return;
  }
  if (from.area === "bag") {
    // Depuis le sac : un minerai va au four, le charbon au combustible.
    const dest: Area | null = canSmelt(source.item)
      ? "furnace_in"
      : source.item === "coal"
        ? "furnace_fuel"
        : null;
    if (!dest) throw new InventoryError("not_allowed");
    moveItem(inv, from, { area: dest, slot: 0 }, amount);
    return;
  }
  const added = addToBag(inv, { ...source, count: amount });
  if (added === 0) throw new InventoryError("full");
  take(inv, from, added);
}

// ---- Table de craft 3 × 3 ----

export type Recipe = {
  result: ItemId;
  count: number;
  matches: (grid: (ItemId | null)[]) => boolean;
};

/** Motifs des pièces d'armure (comme Minecraft) : X = un matériau, . = case vide. */
export const ARMOR_PATTERNS: Record<(typeof ARMOR_PARTS)[number], string[]> = {
  helmet: ["XXX", "X.X"],
  chestplate: ["X.X", "XXX", "XXX"],
  leggings: ["XXX", "X.X", "X.X"],
  boots: ["X.X", "X.X"],
};

/** Réduit la grille au plus petit rectangle qui contient des objets (le motif peut être n'importe où). */
export function trimGrid(grid: (ItemId | null)[]): (ItemId | null)[][] {
  const rows = [0, 1, 2].map((r) => grid.slice(r * 3, r * 3 + 3));
  const used = (cells: (ItemId | null)[]) => cells.some((c) => c !== null);
  const rIdx = [0, 1, 2].filter((r) => used(rows[r]!));
  const cIdx = [0, 1, 2].filter((c) => used(rows.map((row) => row[c] ?? null)));
  if (rIdx.length === 0) return [];
  const r0 = rIdx[0]!;
  const r1 = rIdx.at(-1)!;
  const c0 = cIdx[0]!;
  const c1 = cIdx.at(-1)!;
  return rows.slice(r0, r1 + 1).map((row) => row.slice(c0, c1 + 1));
}

function shaped(pattern: string[], material: ItemId) {
  return (grid: (ItemId | null)[]) => {
    const trimmed = trimGrid(grid);
    if (trimmed.length !== pattern.length) return false;
    return pattern.every((line, r) => {
      const row = trimmed[r]!;
      if (row.length !== line.length) return false;
      return [...line].every((ch, c) => (ch === "X" ? row[c] === material : row[c] === null));
    });
  };
}

function shapeless(ingredients: Partial<Record<ItemId, number>>) {
  return (grid: (ItemId | null)[]) => {
    const counts = new Map<ItemId, number>();
    for (const cell of grid) if (cell) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    const wanted = Object.entries(ingredients) as [ItemId, number][];
    return counts.size === wanted.length && wanted.every(([item, n]) => counts.get(item) === n);
  };
}

export const RECIPES: Recipe[] = [
  ...MATERIALS.filter((m): m is Exclude<Material, "netherite"> => m !== "netherite").flatMap((m) =>
    ARMOR_PARTS.map((part) => ({
      result: `${m}_${part}` as ArmorId,
      count: 1,
      matches: shaped(ARMOR_PATTERNS[part], ARMOR_MATERIAL_ITEM[m]),
    })),
  ),
  // Lingot de netherite : 4 fragments + 4 lingots d'or, n'importe où dans la grille.
  {
    result: "netherite_ingot",
    count: 1,
    matches: shapeless({ netherite_scrap: 4, gold_ingot: 4 }),
  },
  // Pièce de netherite : la même pièce en diamant + 1 lingot de netherite.
  ...ARMOR_PARTS.map((part) => ({
    result: `netherite_${part}` as ArmorId,
    count: 1,
    matches: shapeless({ [`diamond_${part}`]: 1, netherite_ingot: 1 }),
  })),
];

export function findRecipe(grid: (ItemId | null)[]): Recipe | null {
  if (grid.length !== CRAFT_SIZE || grid.every((c) => c === null)) return null;
  return RECIPES.find((r) => r.matches(grid)) ?? null;
}

export function craftGrid(inv: Inventory): (ItemId | null)[] {
  return inv.craft.map((s) => s?.item ?? null);
}

/** Fabrique une fois l'objet de la grille : un objet de chaque case est utilisé, le résultat va dans le sac. */
export function craft(inv: Inventory): Stack {
  const recipe = findRecipe(craftGrid(inv));
  if (!recipe) throw new InventoryError("no_recipe");
  if (!bagFits(inv, recipe.result, recipe.count)) throw new InventoryError("full");
  for (let i = 0; i < CRAFT_SIZE; i++) {
    const s = inv.craft[i];
    if (!s) continue;
    s.count -= 1;
    if (s.count === 0) inv.craft[i] = null;
  }
  const made = newStack(recipe.result, recipe.count);
  addToBag(inv, made);
  return made;
}

// ---- Équipement et effets en course ----

export type Loadout = {
  /** Chance d'esquiver un malus (0 à 0,37). */
  dodge: number;
  /** Bonus d'XP (0,3 = +30 %), armure en or et fiole d'expérience. */
  xpBonus: number;
  immuneAll: boolean;
  immuneFog: boolean;
  /** Malus bloqués d'office (bouclier). */
  shield: number;
  /** Pas de perte de niveau à l'abandon (totem). */
  noLevelLoss: boolean;
  /** Objet à usage unique utilisé pour cette course. */
  item: ItemId | null;
};

export const NO_LOADOUT: Loadout = {
  dodge: 0,
  xpBonus: 0,
  immuneAll: false,
  immuneFog: false,
  shield: 0,
  noLevelLoss: false,
  item: null,
};

/** Effets de l'armure portée et de l'objet activé, figés au départ d'une course. */
export function computeLoadout(armor: readonly Slot[], activeItem: ItemId | null): Loadout {
  const materials = armor.map((s) => (s ? armorInfo(s.item)?.material : undefined));
  let dodge = 0;
  let xpBonus = 0;
  for (const m of materials) {
    if (!m) continue;
    dodge += DODGE_PER_PIECE[m];
    if (m === "gold") xpBonus += GOLD_XP_PER_PIECE;
  }
  const full =
    materials.length === ARMOR_PARTS.length && materials.every((m) => m && m === materials[0]);
  if (full) {
    if (materials[0] === "gold") xpBonus += GOLD_FULL_SET_XP;
    else dodge += FULL_SET_DODGE;
  }
  const loadout: Loadout = { ...NO_LOADOUT, dodge: round2(dodge), xpBonus: round2(xpBonus) };
  if (activeItem && isConsumable(activeItem)) {
    const effect = CONSUMABLE_EFFECT[activeItem];
    loadout.item = activeItem;
    loadout.immuneAll = !!effect.immuneAll;
    loadout.immuneFog = !!effect.immuneFog;
    loadout.shield = effect.shield ?? 0;
    loadout.noLevelLoss = !!effect.noLevelLoss;
    loadout.xpBonus = round2(loadout.xpBonus + (effect.xpBonus ?? 0));
  }
  return loadout;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Usure après une course : chaque pièce portée perd 1 ; à 0 elle se brise. Renvoie les pièces brisées. */
export function wearArmor(inv: Inventory): ItemId[] {
  const broken: ItemId[] = [];
  inv.armor.forEach((s, i) => {
    if (!s || s.durability === null) return;
    s.durability -= 1;
    if (s.durability <= 0) {
      broken.push(s.item);
      inv.armor[i] = null;
    }
  });
  return broken;
}
