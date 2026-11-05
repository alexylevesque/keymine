// Couleurs des bonshommes pixel (accueil, course) : le corps prend la couleur de l'avatar ; chaque
// pièce d'armure n'est dessinée que si le joueur la porte, dans la couleur de son matériau.

export type WornArmor = Partial<Record<"helmet" | "chestplate" | "leggings" | "boots", string>>;

/** Clair, moyen, foncé pour chaque matériau. */
const PALETTE: Record<string, [string, string, string]> = {
  leather: ["#c48a52", "#8b5a2b", "#5a3a1a"],
  copper: ["#e8a070", "#c06a3a", "#7a3e1c"],
  iron: ["#e6e6e6", "#b8b8b8", "#7a7a7a"],
  gold: ["#fff29a", "#f0b429", "#9a6b0a"],
  diamond: ["#a8f5ee", "#45cfc8", "#1e7a75"],
  netherite: ["#7a6e79", "#463d45", "#2e272d"],
};

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + amount * (amount > 0 ? 255 - v : v))));
  return `#${((ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, "0")}`;
}

/** Variables CSS : --m/--l/--d pour le corps, --h*, --c*, --g*, --b* pour casque, plastron, jambières, bottes. */
export function armorVars(color: string, worn: WornArmor = {}): Record<string, string> {
  const body: [string, string, string] = [shade(color, 0.2), color, shade(color, -0.35)];
  const vars: Record<string, string> = { "--m": body[1], "--l": body[0], "--d": body[2] };
  const parts = [
    ["h", worn.helmet],
    ["c", worn.chestplate],
    ["g", worn.leggings],
    ["b", worn.boots],
  ] as const;
  for (const [key, material] of parts) {
    const p = (material && PALETTE[material]) || body;
    vars[`--${key}1`] = p[0];
    vars[`--${key}2`] = p[1];
    vars[`--${key}3`] = p[2];
  }
  return vars;
}

/** Matériaux portés à partir des pièces d'armure de l'inventaire (« iron_helmet » → iron). */
export function wornFromArmor(armor: ({ item: string } | null)[]): WornArmor {
  const parts = ["helmet", "chestplate", "leggings", "boots"] as const;
  const worn: WornArmor = {};
  parts.forEach((part, i) => {
    const piece = armor[i];
    if (piece) worn[part] = piece.item.split("_")[0];
  });
  return worn;
}
