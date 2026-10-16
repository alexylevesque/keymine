import { armorInfo, type ItemId, type Material } from "@/lib/items";

// Icônes des objets : petits dessins pixel ORIGINAUX (16 × 16), faits pour KeyMine. Ce ne sont pas les
// textures de Minecraft (protégées) : seulement des formes génériques (lingot, casque, pomme…).
// Chaque dessin est une grille de lettres ; chaque lettre est une couleur de la palette.

type Palette = Record<string, string>;

const OUTLINE = "#1a1a1a";

const MATERIAL_COLORS: Record<Material, { B: string; L: string; D: string }> = {
  leather: { B: "#8b5a2b", L: "#b98250", D: "#5c3a1a" },
  copper: { B: "#c46a3a", L: "#eba06c", D: "#87431f" },
  iron: { B: "#c4c4c4", L: "#f2f2f2", D: "#828282" },
  gold: { B: "#f2c230", L: "#fff29a", D: "#b07d0b" },
  diamond: { B: "#45cfc8", L: "#bdfff8", D: "#1b8580" },
  netherite: { B: "#4d424b", L: "#7a6c78", D: "#2a2228" },
};

const SHAPES = {
  helmet: [
    "................",
    "................",
    "................",
    "....OOOOOOOO....",
    "...OLLBBBBBBO...",
    "..OLBBBBBBBBDO..",
    "..OLBBBBBBBBDO..",
    "..OBBDOOOODBDO..",
    "..OBDO....OBDO..",
    "..OBDO....OBDO..",
    "..OOOO....OOOO..",
  ],
  chestplate: [
    "................",
    "..OOOO....OOOO..",
    ".OLBBO....OBBDO.",
    ".OLBBBOOOOBBBDO.",
    ".OLBBBBBBBBBBDO.",
    ".OOOBBBBBBBBOOO.",
    "...OLBBBBBBDO...",
    "...OLBBBBBBDO...",
    "...OLBBDBBBDO...",
    "...OLBBBBBBDO...",
    "...OBBBBBBBDO...",
    "...OOOOOOOOOO...",
  ],
  leggings: [
    "................",
    "...OOOOOOOOOO...",
    "...OLBBBBBBDO...",
    "...ODDDDDDDDO...",
    "...OLBBOOBBDO...",
    "...OLBO..OBDO...",
    "...OLBO..OBDO...",
    "...OLBO..OBDO...",
    "...OLBO..OBDO...",
    "...OLBO..OBDO...",
    "...OOOO..OOOO...",
  ],
  boots: [
    "................",
    "................",
    "................",
    "................",
    "...OOOO..OOOO...",
    "...OLBO..OLBO...",
    "...OLBO..OLBO...",
    "..OLBBO..OLBBO..",
    ".OLBBBO..OLBBBO.",
    ".OBBBDO..OBBBDO.",
    ".OOOOOO..OOOOOO.",
  ],
  ingot: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "....OOOOOOOO....",
    "...OLLLLLLLBO...",
    "..OLBBBBBBBBDO..",
    ".OLBBBBBBBBBBDO.",
    ".ODDDDDDDDDDDDO.",
    ".OOOOOOOOOOOOOO.",
  ],
  ore: [
    "................",
    "..OOOOOOOOOOOO..",
    "..OSSSSTSSSSSO..",
    "..OSBBSSSSTSSO..",
    "..OSBLSSSBBSSO..",
    "..OSSSSSSBDSSO..",
    "..OTSSBBSSSSSO..",
    "..OSSSBDSSSTSO..",
    "..OSSSSSSBBSSO..",
    "..OSTSSSSBLSSO..",
    "..OSSSSSSSSSSO..",
    "..OOOOOOOOOOOO..",
  ],
  gem: [
    "................",
    "................",
    ".....OOOOOO.....",
    "....OLLBBBBO....",
    "...OLLBBBBBDO...",
    "..OOOOOOOOOOOO..",
    "...OBBBBBBBDO...",
    "....OBBBBBDO....",
    ".....OBBBDO.....",
    "......OBDO......",
    ".......OO.......",
  ],
  lump: [
    "................",
    "................",
    "................",
    ".....OOOO.......",
    "...OOLBBBOOO....",
    "..OLBBBDBBBBO...",
    "..OBBDBBBBDBBO..",
    "..OBBBBBDBBBDO..",
    "...OBDBBBBBDO...",
    "....OOOBBDOO....",
    ".......OOO......",
  ],
  hide: [
    "................",
    "................",
    "..OO........OO..",
    "..OLOOOOOOOOBO..",
    "...OLBBBBBBBO...",
    "...OBBBDBBBBO...",
    "..OLBBBBBBDBBO..",
    "..OBBDBBBBBBDO..",
    "...OBBBBBDBBO...",
    "..OBOOOOOOOOBO..",
    "..OO........OO..",
  ],
  block: [
    "................",
    "..OOOOOOOOOOOO..",
    "..OLBBBBLBBBBO..",
    "..OBDDBBBDDDBO..",
    "..OBBBDBBBBBDO..",
    "..ODBBBDDBBBBO..",
    "..OBLBBBBDDBBO..",
    "..OBBDDBBBBBLO..",
    "..OBBBBDBBDBBO..",
    "..ODDBBBBDBBBO..",
    "..OBBBLBBBBBDO..",
    "..OOOOOOOOOOOO..",
  ],
  apple: [
    "................",
    "........GG......",
    ".......GO.......",
    "....OOOOOOOO....",
    "...OLLBBBBBBO...",
    "..OLLBBBBBBBDO..",
    "..OLBBBBBBBBDO..",
    "..OBBBBBBBBBDO..",
    "..OBBBBBBBBDDO..",
    "...OBBBBBBDDO...",
    "....OOOOOOOO....",
  ],
  charm: [
    "................",
    ".....OOOOOO.....",
    "....OLBBBBDO....",
    "....OBO..OBO....",
    "....OLBBBBDO....",
    ".....OOBBOO.....",
    "..OOOOOBBOOOOO..",
    "..OLBBBBBBBBDO..",
    "..OOOOOBBOOOOO..",
    "......OBBO......",
    "......OBDO......",
    "......OOOO......",
  ],
  bottle: [
    "................",
    "......OOOO......",
    "......OWWO......",
    ".......OO.......",
    "......OWWO......",
    ".....OWLLWO.....",
    "....OWLBBBWO....",
    "....OWBBBBWO....",
    "....OWBBBDWO....",
    ".....OWDDWO.....",
    "......OOOO......",
  ],
  shield: [
    "................",
    "..OOOOOOOOOOOO..",
    "..ORLLRRRRRRRO..",
    "..ORLWWWWWWWRO..",
    "..ORWWWRRWWWRO..",
    "..ORWWWRRWWWRO..",
    "..ORWRRRRRRWRO..",
    "...ORWWRRWWRO...",
    "....ORWRRWRO....",
    ".....ORRRRO.....",
    "......OOOO......",
  ],
};

type ShapeName = keyof typeof SHAPES;

const STONE = { S: "#7d7d7d", T: "#9a9a9a" };

/** Forme et couleurs de chaque objet (hors armure). */
const ICONS: Record<string, [ShapeName, Palette]> = {
  coal: ["lump", { B: "#2f2f2f", L: "#5a5a5a", D: "#141414" }],
  leather: ["hide", MATERIAL_COLORS.leather],
  copper_ore: ["ore", { ...STONE, ...MATERIAL_COLORS.copper }],
  iron_ore: ["ore", { ...STONE, B: "#d9b48f", L: "#f2d8bc", D: "#9c7650" }],
  gold_ore: ["ore", { ...STONE, ...MATERIAL_COLORS.gold }],
  copper_ingot: ["ingot", MATERIAL_COLORS.copper],
  iron_ingot: ["ingot", MATERIAL_COLORS.iron],
  gold_ingot: ["ingot", MATERIAL_COLORS.gold],
  diamond: ["gem", MATERIAL_COLORS.diamond],
  ancient_debris: ["block", { B: "#5b4038", L: "#8a6a5c", D: "#33221d" }],
  netherite_scrap: ["lump", { B: "#5e4a44", L: "#8c7468", D: "#2e2320" }],
  netherite_ingot: ["ingot", MATERIAL_COLORS.netherite],
  enchanted_golden_apple: ["apple", { ...MATERIAL_COLORS.gold, G: "#3f9a3f" }],
  totem: ["charm", { B: "#e8b84a", L: "#fff1a8", D: "#8a6a10" }],
  xp_bottle: ["bottle", { W: "#dfeff5", B: "#7bd34a", L: "#d6ff9a", D: "#3a8a1c" }],
  shield: ["shield", { R: "#8a5a2b", L: "#c99a62", W: "#b8b8b8" }],
  night_vision: ["bottle", { W: "#dfeff5", B: "#2c3fa8", L: "#7f90ff", D: "#17205e" }],
};

function shapeFor(item: ItemId): [ShapeName, Palette] {
  const armor = armorInfo(item);
  if (armor) return [armor.part, MATERIAL_COLORS[armor.material]];
  return ICONS[item] ?? ["lump", { B: "#888", L: "#aaa", D: "#555" }];
}

/** Lueur des objets enchantés (pomme dorée enchantée). */
const GLOWING: ReadonlySet<ItemId> = new Set(["enchanted_golden_apple"]);

export function ItemIcon({
  item,
  className = "",
  enchanted = false,
}: {
  item: ItemId;
  className?: string;
  /** Pièce enchantée : petite lueur violette, comme dans Minecraft. */
  enchanted?: boolean;
}) {
  const [shape, palette] = shapeFor(item);
  const colors: Palette = { O: OUTLINE, ...palette };
  const rows = SHAPES[shape];
  const offset = Math.floor((16 - rows.length) / 2) + 1;
  const rects: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = colors[ch];
      if (fill)
        rects.push(
          <rect key={`${x}-${y}`} x={x} y={y + offset} width={1} height={1} fill={fill} />,
        );
    });
  });
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={`${enchanted || GLOWING.has(item) ? "item-glow" : ""} ${className}`}
    >
      {rects}
    </svg>
  );
}
