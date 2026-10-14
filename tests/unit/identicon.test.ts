import { describe, expect, it } from "vitest";
import { IDENTICON_COLORS, IDENTICON_SIZE, hashSeed, identicon } from "@/lib/identicon";

describe("identicon (AUTH-03)", () => {
  it("est déterministe : même pseudo, même avatar", () => {
    expect(identicon("Renard_42")).toEqual(identicon("Renard_42"));
  });

  it("ignore la casse et la forme Unicode du pseudo", () => {
    expect(hashSeed("Élodie")).toBe(hashSeed("élodie".toUpperCase().toLowerCase()));
    expect(identicon("ALICE")).toEqual(identicon("alice"));
  });

  it("produit une grille 5×5 symétrique, jamais vide", () => {
    for (const seed of ["a", "bob", "invité", "zzz", "x".repeat(20), ""]) {
      const { cells, color } = identicon(seed);
      expect(cells).toHaveLength(IDENTICON_SIZE * IDENTICON_SIZE);
      expect(cells.some(Boolean)).toBe(true);
      expect(IDENTICON_COLORS).toContain(color);
      for (let r = 0; r < IDENTICON_SIZE; r++) {
        for (let c = 0; c < IDENTICON_SIZE; c++) {
          expect(cells[r * IDENTICON_SIZE + c]).toBe(cells[r * IDENTICON_SIZE + (IDENTICON_SIZE - 1 - c)]);
        }
      }
    }
  });

  it("varie selon le pseudo", () => {
    const seeds = ["alice", "bob", "carole", "david", "emma", "félix", "gaby", "hugo"];
    const distinct = new Set(seeds.map((s) => JSON.stringify(identicon(s))));
    expect(distinct.size).toBeGreaterThanOrEqual(7);
  });
});
