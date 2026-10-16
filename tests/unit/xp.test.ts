import { describe, expect, it } from "vitest";
import {
  abandonPenalty,
  levelFromXp,
  opponentFactor,
  raceXp,
  totalXpForLevel,
  xpToNextLevel,
  type Opponent,
} from "@/lib/xp";

const bot = (level: Opponent["botLevel"]): Opponent => ({ isBot: true, botLevel: level });
const human: Opponent = { isBot: false, botLevel: null };

describe("courbe des niveaux (formule de Minecraft)", () => {
  it("donne les mêmes paliers que Minecraft", () => {
    expect(xpToNextLevel(0)).toBe(7);
    expect(xpToNextLevel(10)).toBe(27);
    expect(xpToNextLevel(20)).toBe(62);
    expect(xpToNextLevel(30)).toBe(112);
    expect(xpToNextLevel(50)).toBe(292);
    expect(xpToNextLevel(100)).toBe(742);
    expect(totalXpForLevel(30)).toBe(1395); // valeur connue de Minecraft
  });

  it("chaque niveau demande plus que le précédent, sans maximum", () => {
    for (let l = 0; l < 300; l++) expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
    expect(levelFromXp(totalXpForLevel(250)).level).toBe(250);
  });

  it("calcule le niveau et le remplissage de la barre", () => {
    expect(levelFromXp(0)).toEqual({ level: 0, intoLevel: 0, needed: 7, fraction: 0 });
    expect(levelFromXp(7)).toMatchObject({ level: 1, intoLevel: 0, needed: 9 });
    expect(levelFromXp(totalXpForLevel(30) + 56)).toMatchObject({ level: 30, intoLevel: 56, fraction: 0.5 });
  });
});

describe("XP d'une course (tableau validé par l'étudiant)", () => {
  it("reproduit les exemples du tableau", () => {
    expect(raceXp({ complexity: "easy", words: 40, opponents: [bot("noob")], status: "finished", rank: 1, accuracy: 96 })).toBe(26);
    expect(raceXp({ complexity: "hard", words: 40, opponents: [bot("impossible")], status: "finished", rank: 1, accuracy: 90 })).toBe(52);
    expect(
      raceXp({ complexity: "hard", words: 40, opponents: Array(30).fill(bot("impossible")), status: "finished", rank: 1, accuracy: 90 }),
    ).toBe(160);
    expect(raceXp({ complexity: "medium", words: 40, opponents: [human, human, human], status: "finished", rank: 2, accuracy: 90 })).toBe(36);
  });

  it("plus difficile, plus long, plus d'adversaires : plus d'XP", () => {
    const base = { words: 40, opponents: [bot("expert")], status: "finished" as const, rank: 1, accuracy: 90 };
    expect(raceXp({ ...base, complexity: "hard" })).toBeGreaterThan(raceXp({ ...base, complexity: "easy" }));
    expect(raceXp({ ...base, complexity: "easy", words: 120 })).toBeGreaterThan(raceXp({ ...base, complexity: "easy" }));
    expect(opponentFactor(Array(30).fill(bot("impossible")))).toBe(4); // plafond
  });

  it("la place compte, le temps écoulé rapporte la moitié, l'abandon rien", () => {
    const base = { complexity: "medium" as const, words: 40, opponents: [bot("expert")], accuracy: 90 };
    const first = raceXp({ ...base, status: "finished", rank: 1 });
    const second = raceXp({ ...base, status: "finished", rank: 2 });
    const fourth = raceXp({ ...base, status: "finished", rank: 4 });
    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(fourth);
    expect(raceXp({ ...base, status: "timeout", rank: 1 })).toBeLessThan(fourth);
    expect(raceXp({ ...base, status: "abandoned", rank: 2 })).toBe(0);
  });

  it("bonus de précision : +5 à 95 %, +10 à 100 %", () => {
    const base = { complexity: "easy" as const, words: 40, opponents: [bot("noob")], status: "finished" as const, rank: 1 };
    expect(raceXp({ ...base, accuracy: 100 }) - raceXp({ ...base, accuracy: 94 })).toBe(10);
    expect(raceXp({ ...base, accuracy: 95 }) - raceXp({ ...base, accuracy: 94 })).toBe(5);
  });
});

describe("abandon : perte d'un niveau complet", () => {
  it("fait perdre exactement un niveau en gardant le pourcentage de la barre", () => {
    const total = totalXpForLevel(10) + 13; // niveau 10, 13/27
    const after = total - abandonPenalty(total);
    const before = levelFromXp(total);
    const now = levelFromXp(after);
    expect(now.level).toBe(9);
    expect(Math.abs(now.fraction - before.fraction)).toBeLessThan(0.05);
  });

  it("ne fait rien perdre au niveau 0", () => {
    expect(abandonPenalty(0)).toBe(0);
    expect(abandonPenalty(5)).toBe(0);
  });

  it("au niveau 100, on retombe au niveau 99", () => {
    const total = totalXpForLevel(100) + 100;
    expect(levelFromXp(total - abandonPenalty(total)).level).toBe(99);
  });
});
