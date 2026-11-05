"use client";

import type { CSSProperties } from "react";
import { photoSkin, usePhotoPixels } from "@/lib/photo-skin";

// Personnage de l'inventaire (maquette « 7 · Inventaire ») : un mineur pixel de la couleur de
// l'avatar, avec le logo KeyMine dessiné sur le torse, et les pièces d'armure portées par-dessus.
// Les pièces sont dessinées en netherite ; un filtre CSS leur donne la couleur du matériau.

const BODY =
  '<path fill="var(--l)" d="M4 0h7v1h-7zM4 1h1v1h-1zM4 2h1v1h-1zM4 3h1v1h-1zM4 4h1v1h-1zM4 5h1v1h-1zM4 6h1v1h-1zM4 7h1v1h-1zM0 8h3v1h-3zM4 8h7v1h-7zM12 8h3v1h-3zM0 9h1v1h-1zM4 9h1v1h-1zM12 9h1v1h-1zM0 10h1v1h-1zM4 10h1v1h-1zM12 10h1v1h-1zM0 11h1v1h-1zM4 11h1v1h-1zM12 11h1v1h-1zM0 12h1v1h-1zM4 12h1v1h-1zM12 12h1v1h-1zM0 13h1v1h-1zM4 13h1v1h-1zM12 13h1v1h-1zM0 14h1v1h-1zM4 14h1v1h-1zM12 14h1v1h-1zM0 15h1v1h-1zM4 15h1v1h-1zM12 15h1v1h-1zM0 16h1v1h-1zM4 16h1v1h-1zM12 16h1v1h-1zM0 17h1v1h-1zM4 17h1v1h-1zM12 17h1v1h-1zM0 18h1v1h-1zM4 18h1v1h-1zM12 18h1v1h-1zM4 19h1v1h-1zM4 20h3v1h-3zM8 20h3v1h-3zM4 21h1v1h-1zM8 21h1v1h-1zM4 22h1v1h-1zM8 22h1v1h-1zM4 23h1v1h-1zM8 23h1v1h-1zM4 24h1v1h-1zM8 24h1v1h-1zM4 25h1v1h-1zM8 25h1v1h-1zM4 26h1v1h-1zM8 26h1v1h-1zM4 27h1v1h-1zM8 27h1v1h-1zM4 28h1v1h-1zM8 28h1v1h-1zM4 29h1v1h-1zM8 29h1v1h-1zM4 30h1v1h-1zM8 30h1v1h-1zM4 31h1v1h-1zM8 31h1v1h-1z"/><path fill="var(--d)" d="M11 0h1v1h-1zM11 1h1v1h-1zM11 2h1v1h-1zM11 3h1v1h-1zM11 4h1v1h-1zM11 5h1v1h-1zM7 6h2v1h-2zM11 6h1v1h-1zM11 7h1v1h-1zM3 8h1v1h-1zM11 8h1v1h-1zM15 8h1v1h-1zM3 9h1v1h-1zM11 9h1v1h-1zM15 9h1v1h-1zM3 10h1v1h-1zM11 10h1v1h-1zM15 10h1v1h-1zM3 11h1v1h-1zM11 11h1v1h-1zM15 11h1v1h-1zM3 12h1v1h-1zM11 12h1v1h-1zM15 12h1v1h-1zM3 13h1v1h-1zM11 13h1v1h-1zM15 13h1v1h-1zM3 14h1v1h-1zM11 14h1v1h-1zM15 14h1v1h-1zM3 15h1v1h-1zM11 15h1v1h-1zM15 15h1v1h-1zM3 16h1v1h-1zM11 16h1v1h-1zM15 16h1v1h-1zM3 17h1v1h-1zM11 17h1v1h-1zM15 17h1v1h-1zM3 18h1v1h-1zM11 18h1v1h-1zM15 18h1v1h-1zM0 19h4v1h-4zM11 19h5v1h-5zM7 20h1v1h-1zM11 20h1v1h-1zM7 21h1v1h-1zM11 21h1v1h-1zM7 22h1v1h-1zM11 22h1v1h-1zM7 23h1v1h-1zM11 23h1v1h-1zM7 24h1v1h-1zM11 24h1v1h-1zM7 25h1v1h-1zM11 25h1v1h-1zM7 26h1v1h-1zM11 26h1v1h-1zM7 27h1v1h-1zM11 27h1v1h-1zM7 28h1v1h-1zM11 28h1v1h-1zM7 29h1v1h-1zM11 29h1v1h-1zM7 30h1v1h-1zM11 30h1v1h-1zM7 31h1v1h-1zM11 31h1v1h-1z"/><path fill="var(--m)" d="M5 1h6v1h-6zM5 2h6v1h-6zM5 3h6v1h-6zM7 4h2v1h-2zM5 5h6v1h-6zM5 6h2v1h-2zM9 6h2v1h-2zM5 7h6v1h-6zM1 9h2v1h-2zM5 9h6v1h-6zM13 9h2v1h-2zM1 10h2v1h-2zM5 10h6v1h-6zM13 10h2v1h-2zM1 11h2v1h-2zM5 11h6v1h-6zM13 11h2v1h-2zM1 12h2v1h-2zM5 12h6v1h-6zM13 12h2v1h-2zM1 13h2v1h-2zM5 13h6v1h-6zM13 13h2v1h-2zM1 14h2v1h-2zM5 14h6v1h-6zM13 14h2v1h-2zM1 15h2v1h-2zM5 15h6v1h-6zM13 15h2v1h-2zM1 16h2v1h-2zM5 16h6v1h-6zM13 16h2v1h-2zM1 17h2v1h-2zM5 17h6v1h-6zM13 17h2v1h-2zM1 18h2v1h-2zM5 18h6v1h-6zM13 18h2v1h-2zM5 19h6v1h-6zM5 21h2v1h-2zM9 21h2v1h-2zM5 22h2v1h-2zM9 22h2v1h-2zM5 23h2v1h-2zM9 23h2v1h-2zM5 24h2v1h-2zM9 24h2v1h-2zM5 25h2v1h-2zM9 25h2v1h-2zM5 26h2v1h-2zM9 26h2v1h-2zM5 27h2v1h-2zM9 27h2v1h-2zM5 28h2v1h-2zM9 28h2v1h-2zM5 29h2v1h-2zM9 29h2v1h-2zM5 30h2v1h-2zM9 30h2v1h-2zM5 31h2v1h-2zM9 31h2v1h-2z"/><path fill="#FFF8E6" d="M5 4h1v1h-1zM10 4h1v1h-1z"/><path fill="#1B1209" d="M6 4h1v1h-1zM9 4h1v1h-1z"/>';
/** Fond du logo sur le torse ; la lettre est dessinée par-dessus (première lettre du pseudo). */
const LOGO_BG = '<path fill="var(--d)" d="M5 11h6v7h-6z"/>';

/** Police pixel 4 × 5 pour la lettre du torse (dessin original). */
const FONT: Record<string, string> = {
  A: ".##.#..######..##..#",
  B: "###.#..####.#..####.",
  C: ".####...#...#....###",
  D: "###.#..##..##..####.",
  E: "#####...###.#...####",
  F: "#####...###.#...#...",
  G: ".####...#.###..#.###",
  H: "#..##..######..##..#",
  I: "###..#...#...#..###.",
  J: "..##...#...##..#.##.",
  K: "#..##.#.##..#.#.#..#",
  L: "#...#...#...#...####",
  M: "#..##########..##..#",
  N: "#..###.##.###..##..#",
  O: ".##.#..##..##..#.##.",
  P: "###.#..####.#...#...",
  Q: ".##.#..##..##.#..#.#",
  R: "###.#..####.#.#.#..#",
  S: ".####....##....####.",
  T: "####.##..##..##..##.",
  U: "#..##..##..##..#.##.",
  V: "#..##..##..#.##..##.",
  W: "#..##..##########..#",
  X: "#..#.##..##..##.#..#",
  Y: "#..##..#.##..##..##.",
  Z: "####...#.##.#...####",
  "0": ".##.#.####.##..#.##.",
  "1": ".#..##...#...#..###.",
  "2": "###....#.##.#...####",
  "3": "###....#.##....####.",
  "4": "#..##..#####...#...#",
  "5": "#####...###....####.",
  "6": ".##.#...###.#..#.##.",
  "7": "####...#..#..#...#..",
  "8": ".##.#..#.##.#..#.##.",
  "9": ".##.#..#.###...#.##.",
};

/** Pixels de la lettre, placée à x 6–9 et y 12–16 comme le logo de la maquette. */
export function chestLetter(name: string): string {
  const ch = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/[A-Z0-9]/)?.[0];
  const rows = FONT[ch ?? "K"] ?? FONT.K!;
  let d = "";
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] === "#") d += `M${6 + (i % 4)} ${12 + Math.floor(i / 4)}h1v1h-1z`;
  }
  return `<path fill="#fff8e6" d="${d}"/>`;
}
const PARTS = {
  helmet:
    '<path fill="#151014" d="M3 0h10v1h-10zM3 1h1v1h-1zM12 1h1v1h-1zM3 2h1v1h-1zM12 2h1v1h-1zM3 3h1v1h-1zM5 3h6v1h-6zM12 3h1v1h-1zM3 4h2v1h-2zM11 4h2v1h-2zM3 5h2v1h-2zM11 5h2v1h-2zM3 6h2v1h-2zM11 6h2v1h-2zM3 7h1v1h-1zM12 7h1v1h-1z"/><path fill="#8E828D" d="M4 1h8v1h-8z"/><path fill="#675C66" d="M4 2h1v1h-1z"/><path fill="#2E272D" d="M5 2h2v1h-2zM9 2h3v1h-3zM4 3h1v1h-1zM11 3h1v1h-1z"/><path fill="#6B4A78" d="M7 2h2v1h-2z"/>',
  chestplate:
    '<path fill="#151014" d="M0 8h6v1h-6zM10 8h6v1h-6zM0 9h1v1h-1zM6 9h4v1h-4zM15 9h1v1h-1zM0 10h1v1h-1zM15 10h1v1h-1zM0 11h3v1h-3zM13 11h3v1h-3zM3 12h1v1h-1zM12 12h1v1h-1zM3 13h1v1h-1zM12 13h1v1h-1zM3 14h1v1h-1zM12 14h1v1h-1zM3 15h1v1h-1zM12 15h1v1h-1zM3 16h1v1h-1zM12 16h1v1h-1zM3 17h1v1h-1zM12 17h1v1h-1zM3 18h1v1h-1zM12 18h1v1h-1zM3 19h10v1h-10z"/><path fill="#8E828D" d="M1 9h5v1h-5zM10 9h5v1h-5zM5 10h2v1h-2zM9 10h2v1h-2zM5 18h1v1h-1zM10 18h1v1h-1z"/><path fill="#675C66" d="M1 10h1v1h-1zM4 12h1v1h-1zM4 14h1v1h-1zM4 15h1v1h-1zM4 17h1v1h-1zM4 18h1v1h-1z"/><path fill="#2E272D" d="M2 10h1v1h-1zM7 10h1v1h-1zM13 10h2v1h-2zM7 11h1v1h-1zM7 12h1v1h-1zM11 12h1v1h-1zM4 13h8v1h-8zM7 14h1v1h-1zM11 14h1v1h-1zM7 15h1v1h-1zM11 15h1v1h-1zM4 16h8v1h-8zM7 17h1v1h-1zM11 17h1v1h-1zM6 18h2v1h-2zM9 18h1v1h-1zM11 18h1v1h-1z"/><path fill="#463D45" d="M3 10h2v1h-2zM11 10h2v1h-2zM3 11h4v1h-4zM9 11h4v1h-4zM5 12h2v1h-2zM9 12h2v1h-2zM5 14h2v1h-2zM9 14h2v1h-2zM5 15h2v1h-2zM9 15h2v1h-2zM5 17h2v1h-2zM9 17h2v1h-2z"/><path fill="#3A3239" d="M8 10h1v1h-1zM8 11h1v1h-1zM8 12h1v1h-1zM8 14h1v1h-1zM8 15h1v1h-1zM8 17h1v1h-1zM8 18h1v1h-1z"/>',
  leggings:
    '<path fill="#151014" d="M3 20h4v1h-4zM9 20h4v1h-4zM3 21h1v1h-1zM12 21h1v1h-1zM3 22h1v1h-1zM12 22h1v1h-1zM3 23h1v1h-1zM12 23h1v1h-1zM3 24h1v1h-1zM12 24h1v1h-1zM3 25h1v1h-1zM12 25h1v1h-1zM3 26h10v1h-10z"/><path fill="#8E828D" d="M7 20h2v1h-2zM4 21h8v1h-8zM5 24h1v1h-1zM10 24h1v1h-1z"/><path fill="#675C66" d="M4 22h1v1h-1zM4 23h1v1h-1zM4 24h1v1h-1zM4 25h1v1h-1z"/><path fill="#463D45" d="M5 22h6v1h-6zM5 23h6v1h-6zM6 24h4v1h-4z"/><path fill="#2E272D" d="M11 22h1v1h-1zM11 23h1v1h-1zM11 24h1v1h-1zM5 25h7v1h-7z"/>',
  boots:
    '<path fill="#151014" d="M3 27h10v1h-10zM3 28h1v1h-1zM12 28h1v1h-1zM3 29h1v1h-1zM12 29h1v1h-1zM3 30h1v1h-1zM12 30h1v1h-1zM3 31h10v1h-10z"/><path fill="#8E828D" d="M4 28h8v1h-8z"/><path fill="#675C66" d="M4 29h1v1h-1z"/><path fill="#463D45" d="M5 29h6v1h-6z"/><path fill="#2E272D" d="M11 29h1v1h-1zM7 30h2v1h-2z"/><path fill="#3A3239" d="M4 30h3v1h-3zM9 30h3v1h-3z"/>',
} as const;

export type FigurePart = keyof typeof PARTS;

/** Forme d'une pièce, en masque CSS : le reflet enchanté ne passe que sur l'armure. */
function partMask(part: FigurePart): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 32" shape-rendering="crispEdges">${PARTS[part].replace(/fill="[^"]+"/g, 'fill="#000"')}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Filtre de couleur par matériau (la netherite garde ses couleurs d'origine). */
const MATERIAL_FILTER: Record<string, string> = {
  leather: "sepia(1) saturate(2.2) brightness(1.6)",
  copper: "sepia(1) saturate(3.5) hue-rotate(-18deg) brightness(1.7)",
  iron: "grayscale(1) brightness(2.3)",
  gold: "sepia(1) saturate(5) hue-rotate(5deg) brightness(2.2)",
  diamond: "sepia(1) saturate(4) hue-rotate(130deg) brightness(2.1)",
  netherite: "none",
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + amount * (amount > 0 ? 255 - v : v))));
  return `#${((ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, "0")}`;
}

export function MinerFigure({
  color,
  worn,
  label,
  name,
  enchanted = {},
  photoUrl = null,
}: {
  /** Photo de profil : le personnage est « peint » avec elle. */
  photoUrl?: string | null;
  /** Pièces enchantées : un reflet violet passe dessus, comme sur leur case. */
  enchanted?: Partial<Record<FigurePart, boolean>>;
  /** Pseudo du joueur : sa première lettre est dessinée sur le torse. */
  name: string;
  /** Couleur de l'avatar du joueur. */
  color: string;
  /** Matériau porté pour chaque pièce (absent : pièce non portée). */
  worn: Partial<Record<FigurePart, string>>;
  label: string;
}) {
  const photo = usePhotoPixels(photoUrl, 16, 32);
  const base = photo?.avg ?? color;
  const vars = {
    "--m": base,
    "--l": shade(base, 0.2),
    "--d": shade(base, -0.35),
  } as CSSProperties;
  return (
    <div className="inv-figwrap" role="img" aria-label={label}>
      <svg
        className="inv-fig"
        viewBox="0 0 16 32"
        shapeRendering="crispEdges"
        style={vars}
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html:
            (photo
              ? photoSkin(`<svg viewBox="0 0 16 32">${BODY}</svg>`, photo).replace(
                  /^<svg[^>]*>|<\/svg>$/g,
                  "",
                )
              : BODY) +
            LOGO_BG +
            chestLetter(name),
        }}
      />
      {(Object.keys(PARTS) as FigurePart[]).map((part) =>
        worn[part] ? (
          <span key={part}>
            <svg
              className="inv-fig inv-fig-part"
              viewBox="0 0 16 32"
              shapeRendering="crispEdges"
              style={{ filter: MATERIAL_FILTER[worn[part]!] ?? "none" }}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: PARTS[part] }}
            />
            {enchanted[part] && (
              <span
                className="inv-fig-glint"
                aria-hidden="true"
                style={{ maskImage: partMask(part), WebkitMaskImage: partMask(part) }}
              />
            )}
          </span>
        ) : null,
      )}
      <span className="inv-shadow" aria-hidden="true" />
    </div>
  );
}
