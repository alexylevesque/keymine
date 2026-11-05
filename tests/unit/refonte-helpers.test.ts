import { describe, expect, it, vi } from "vitest";

// Fonctions pures ajoutées avec la refonte des pages (maquettes du 4 nov.).
vi.mock("@/lib/db", () => ({ db: {} })); // lib/history-tiles importe la base ; dotOf n'en a pas besoin

import { weakestKeys } from "@/lib/weak-keys";
import { replayRanks, type ReplaySeries } from "@/components/results/ReplayChart";
import { dotOf } from "@/lib/history-tiles";
import { runningAverage } from "@/components/history/TileBars";
import { armorVars, shade, wornFromArmor } from "@/lib/armor-look";
import { chestLetter } from "@/components/inventory/MinerFigure";
import { photoSkin, type PhotoPixels } from "@/lib/photo-skin";

describe("weakestKeys (tuile « À travailler »)", () => {
  const row = (char: string, correct: number, error: number) => ({
    char,
    correct_count: correct,
    error_count: error,
  });

  it("garde les touches assez tapées, avec au moins une erreur, la pire d'abord", () => {
    const keys = weakestKeys([
      row("a", 9, 1), // 10 %
      row("b", 1, 1), // trop peu de frappes
      row("c", 6, 4), // 40 %
      row("d", 10, 0), // aucune erreur
      row(" ", 1, 9), // espace ignorée
      row("e", 8, 2), // 20 %
    ]);
    expect(keys.map((k) => k.key)).toEqual(["c", "e", "a"]);
    expect(keys[0]!.rate).toBeCloseTo(0.4);
  });

  it("départage par ordre alphabétique et respecte le maximum", () => {
    const keys = weakestKeys([row("z", 5, 5), row("m", 5, 5), row("q", 5, 5)], 2);
    expect(keys.map((k) => k.key)).toEqual(["m", "q"]);
  });
});

describe("replayRanks (replay des résultats)", () => {
  // MPM constant : caractères tapés = MPM × 5 × t / 60.
  const runner = (id: string, wpm: number, rank: number, progress = 60): ReplaySeries => ({
    id,
    name: id,
    isMe: false,
    rank,
    progress,
    textLength: 60,
    points: Array.from({ length: 40 }, (_, i) => ({ t: i + 1, wpm })),
  });

  it("le plus rapide est premier à chaque palier de 10 %", () => {
    const ranks = replayRanks([runner("lent", 30, 2), runner("vite", 60, 1)]);
    expect(ranks.get("vite")!.map((p) => p.rank)).toEqual(Array(10).fill(1));
    expect(ranks.get("lent")!.map((p) => p.rank)).toEqual(Array(10).fill(2));
    expect(ranks.get("vite")![0]!.wpm).toBe(60);
  });

  it("celui qui n'a pas fini le texte n'atteint pas le dernier palier", () => {
    const ranks = replayRanks([runner("fini", 30, 1), runner("pasfini", 60, 2, 50)]);
    const last = ranks.get("pasfini")!.at(-1)!;
    expect(last.rank).toBe(2);
    expect(last.wpm).toBeNull();
    expect(ranks.get("fini")!.at(-1)!.rank).toBe(1);
  });
});

describe("dotOf et runningAverage (tuiles de l'historique)", () => {
  it("donne le bon type de case par course", () => {
    expect(dotOf({ role: "spectator", status: "finished", rank: null })).toBe("spectated");
    expect(dotOf({ role: "participant", status: "abandoned", rank: 3 })).toBe("abandoned");
    expect(dotOf({ role: "participant", status: "finished", rank: 1 })).toBe("win");
    expect(dotOf({ role: "participant", status: "timeout", rank: 2 })).toBe("played");
  });

  it("calcule la moyenne cumulée", () => {
    expect(runningAverage([10, 20, 30])).toEqual([10, 15, 20]);
    expect(runningAverage([])).toEqual([]);
  });
});

describe("armure portée (bonshommes pixel)", () => {
  it("éclaircit et fonce une couleur", () => {
    expect(shade("#000000", 0.5)).toBe("#808080");
    expect(shade("#ffffff", -0.5)).toBe("#808080");
    expect(shade("#123456", 0)).toBe("#123456");
  });

  it("sans armure, chaque pièce prend la couleur du corps", () => {
    const vars = armorVars("#3d6fc4");
    expect(vars["--m"]).toBe("#3d6fc4");
    expect(vars["--h2"]).toBe("#3d6fc4");
    expect(vars["--b2"]).toBe("#3d6fc4");
  });

  it("une pièce portée prend la couleur de son matériau", () => {
    const vars = armorVars("#3d6fc4", { helmet: "diamond", boots: "gold" });
    expect(vars["--h2"]).toBe("#45cfc8");
    expect(vars["--b2"]).toBe("#f0b429");
    expect(vars["--c2"]).toBe("#3d6fc4"); // plastron non porté
    expect(armorVars("#3d6fc4", { helmet: "inconnu" })["--h2"]).toBe("#3d6fc4");
  });

  it("lit le matériau dans le nom de l'objet de l'inventaire", () => {
    expect(
      wornFromArmor([{ item: "iron_helmet" }, null, { item: "netherite_leggings" }, null]),
    ).toEqual({ helmet: "iron", leggings: "netherite" });
    expect(wornFromArmor([])).toEqual({});
  });
});

describe("chestLetter (lettre du torse dans l'inventaire)", () => {
  const pixels = (svg: string) => (svg.match(/h1v1h-1z/g) ?? []).length;

  it("dessine la première lettre du pseudo, sans accent", () => {
    expect(chestLetter("banane")).toBe(chestLetter("B"));
    expect(chestLetter("Éloi")).toBe(chestLetter("E"));
    expect(chestLetter("banane")).not.toBe(chestLetter("A"));
  });

  it("saute les caractères qui ne sont ni lettre ni chiffre, K par défaut", () => {
    expect(chestLetter("_-7zed")).toBe(chestLetter("7"));
    expect(chestLetter("!!!")).toBe(chestLetter("K"));
    expect(pixels(chestLetter("I"))).toBeGreaterThan(5);
  });

  it("reste dans la zone du logo (x 6–9, y 12–16)", () => {
    for (const [, x, y] of chestLetter("W").matchAll(/M(\d+) (\d+)h1/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(6);
      expect(Number(x)).toBeLessThanOrEqual(9);
      expect(Number(y)).toBeGreaterThanOrEqual(12);
      expect(Number(y)).toBeLessThanOrEqual(16);
    }
  });
});

describe("photoSkin (bonhomme peint avec la photo)", () => {
  // Photo 2 × 2 : rouge en haut, bleu en bas.
  const photo: PhotoPixels = {
    w: 2,
    h: 2,
    avg: "#800080",
    data: new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]),
  };

  it("remplace chaque case de peau par la couleur de la photo au même endroit", () => {
    const out = photoSkin(
      '<svg viewBox="0 0 2 2"><path fill="var(--m)" d="M0 0h2v2h-2z"/></svg>',
      photo,
    );
    expect(out).toContain('fill="#ff0000" d="M0 0h1v1h-1z"');
    expect(out).toContain('fill="#ff0000" d="M1 0h1v1h-1z"');
    expect(out).toContain('fill="#0000ff" d="M0 1h1v1h-1z"');
    expect(out).not.toContain("var(--m)");
  });

  it("garde le relief : --l plus clair, --d plus foncé", () => {
    const light = photoSkin(
      '<svg viewBox="0 0 2 2"><path fill="var(--l)" d="M0 0h1v1h-1z"/></svg>',
      photo,
    );
    const dark = photoSkin(
      '<svg viewBox="0 0 2 2"><path fill="var(--d)" d="M0 0h1v1h-1z"/></svg>',
      photo,
    );
    expect(light).toMatch(/fill="#ff2e2e"/);
    expect(dark).toMatch(/fill="#b30000"/);
  });

  it("ne touche pas aux dessins d'une autre taille ni aux autres couleurs", () => {
    const other = '<svg viewBox="0 0 10 8"><path fill="var(--m)" d="M0 0h1v1h-1z"/></svg>';
    expect(photoSkin(other, photo)).toBe(other);
    const armor = '<svg viewBox="0 0 2 2"><path fill="var(--h2)" d="M0 0h1v1h-1z"/></svg>';
    expect(photoSkin(armor, photo)).toBe(armor);
  });
});
