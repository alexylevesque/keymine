// Avatar généré (AUTH-03) : un motif pixel 5×5 symétrique, déterministe,
// calculé à partir d'une graine (le pseudo). Même pseudo = même avatar,
// partout et à chaque visite, sans rien stocker ni appeler de service externe.

/** Couleurs de fond possibles : assez foncées pour un motif blanc lisible. */
export const IDENTICON_COLORS = [
  "#3d6fc4",
  "#b03a7a",
  "#a85512",
  "#17706f",
  "#7a45b0",
  "#3f7d24",
  "#b63a32",
] as const;

export const IDENTICON_SIZE = 5;

export type Identicon = {
  color: string;
  /** Cases allumées, ligne par ligne (IDENTICON_SIZE × IDENTICON_SIZE). */
  cells: boolean[];
};

/** Hachage FNV-1a 32 bits : rapide, stable, suffisant pour un motif visuel. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (const ch of seed.normalize("NFC").toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function identicon(seed: string): Identicon {
  const h = hashSeed(seed);
  const color = IDENTICON_COLORS[h % IDENTICON_COLORS.length]!;
  const half = Math.ceil(IDENTICON_SIZE / 2); // 3 colonnes tirées, 2 en miroir
  const cells: boolean[] = [];
  let bits = Math.floor(h / IDENTICON_COLORS.length);
  let lit = 0;
  for (let row = 0; row < IDENTICON_SIZE; row++) {
    const left: boolean[] = [];
    for (let col = 0; col < half; col++) {
      const on = (bits & 1) === 1;
      bits = bits >>> 1;
      left.push(on);
      if (on) lit++;
    }
    const mirror = left.slice(0, IDENTICON_SIZE - half).reverse();
    cells.push(...left, ...mirror);
  }
  // Un motif vide (rare) donnerait un carré uni : on allume alors la colonne centrale.
  if (lit === 0) {
    for (let row = 0; row < IDENTICON_SIZE; row++) cells[row * IDENTICON_SIZE + (half - 1)] = true;
  }
  return { color, cells };
}
