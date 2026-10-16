import { describe, expect, it } from "vitest";
import {
  addDays,
  leagueMoves,
  leaguePrize,
  MIN_WINS,
  nextLeague,
  previousWeekStart,
  weekEnd,
  weekStart,
} from "@/lib/league";

describe("semaines (heure de Toronto)", () => {
  it("commencent le lundi à minuit", () => {
    expect(weekStart(new Date("2026-10-16T15:00:00Z"))).toBe("2026-10-12"); // vendredi
    expect(weekStart(new Date("2026-10-19T03:59:00Z"))).toBe("2026-10-12"); // dimanche 23 h 59
    expect(weekStart(new Date("2026-10-19T04:00:00Z"))).toBe("2026-10-19"); // lundi 0 h
    expect(previousWeekStart(new Date("2026-10-19T04:00:00Z"))).toBe("2026-10-12");
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05");
  });

  it("finissent le lundi suivant à minuit, changement d'heure compris", () => {
    expect(weekEnd(new Date("2026-10-16T15:00:00Z")).toISOString()).toBe(
      "2026-10-19T04:00:00.000Z",
    );
    // Semaine du 26 oct. 2026 : on recule d'une heure le 1er novembre, la fin est à 5 h UTC.
    expect(weekEnd(new Date("2026-10-28T15:00:00Z")).toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });
});

describe("classes", () => {
  it("montées et descentes selon le nombre de joueurs actifs (tableau validé)", () => {
    expect(leagueMoves(1)).toEqual({ up: 0, down: 0 });
    expect(leagueMoves(4)).toEqual({ up: 1, down: 0 });
    expect(leagueMoves(5)).toEqual({ up: 2, down: 1 });
    expect(leagueMoves(7)).toEqual({ up: 2, down: 1 });
    expect(leagueMoves(8)).toEqual({ up: 3, down: 3 });
  });

  it("monter demande 3 victoires ; jamais sous bronze ni au-dessus de netherite", () => {
    expect(nextLeague(0, 1, 3, MIN_WINS)).toBe(1);
    expect(nextLeague(0, 1, 3, MIN_WINS - 1)).toBe(0);
    expect(nextLeague(4, 1, 3, 10)).toBe(4);
    expect(nextLeague(2, 5, 5, 0)).toBe(1); // dernier de 5 : descend
    expect(nextLeague(0, 5, 5, 0)).toBe(0); // bronze : reste
    expect(nextLeague(2, 4, 5, 1)).toBe(2);
    expect(nextLeague(3, 6, 8, 0)).toBe(2); // 3 derniers de 8
    expect(nextLeague(3, 5, 8, 2)).toBe(3);
  });

  it("prix : plus haute est la classe, plus gros est le prix", () => {
    expect(leaguePrize(0, 1)).toMatchObject({
      xp: 150,
      items: [{ item: "iron_ingot", count: 4 }],
      boost: 0.15,
    });
    expect(leaguePrize(3, 1)).toMatchObject({
      xp: 500,
      items: [{ item: "netherite_ingot", count: 1 }],
    });
    expect(leaguePrize(4, 1)).toMatchObject({
      xp: 800,
      items: [{ item: "netherite_ingot", count: 2 }],
    });
    expect(leaguePrize(1, 3)).toMatchObject({ xp: 80, boost: 0.07 });
    expect(leaguePrize(4, 7)).toEqual({ xp: 0, items: [], boost: 0.07 });
    expect(leaguePrize(0, 11)).toBeNull();
    for (let l = 1; l < 5; l++)
      expect(leaguePrize(l, 1)!.xp).toBeGreaterThan(leaguePrize(l - 1, 1)!.xp);
  });
});
