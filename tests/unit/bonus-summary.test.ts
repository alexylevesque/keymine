import { describe, expect, it } from "vitest";
import { groupBonuses } from "@/lib/bonus-summary";

describe("groupBonuses (RES-02)", () => {
  it("regroupe les bonus du même type, dans l'ordre de leur première apparition", () => {
    expect(groupBonuses([{ kind: "fog" }, { kind: "plus_words" }, { kind: "fog" }])).toEqual([
      { kind: "fog", count: 2 },
      { kind: "plus_words", count: 1 },
    ]);
  });

  it("ne renvoie rien sans bonus", () => {
    expect(groupBonuses([])).toEqual([]);
  });
});
