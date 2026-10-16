import { describe, expect, it } from "vitest";
import {
  distanceToRect,
  TYPIST_FALLOFF_PX,
  TYPIST_MAX_RATE,
  TYPIST_MIN_RATE,
  typistRate,
  typistRateForVisibility,
} from "@/lib/typist";

describe("personnage de l'accueil : vitesse de frappe", () => {
  const button = { left: 100, top: 100, right: 300, bottom: 160 };

  it("mesure la distance au bouton (0 dessus)", () => {
    expect(distanceToRect(200, 130, button)).toBe(0);
    expect(distanceToRect(400, 130, button)).toBe(100);
    expect(distanceToRect(0, 0, button)).toBeCloseTo(Math.hypot(100, 100));
  });

  it("tape de plus en plus vite en s'approchant, et ralentit en s'éloignant", () => {
    expect(typistRate(0)).toBe(TYPIST_MAX_RATE);
    expect(typistRate(TYPIST_FALLOFF_PX)).toBeCloseTo(TYPIST_MIN_RATE);
    expect(typistRate(10_000)).toBeCloseTo(TYPIST_MIN_RATE);
    for (let d = 0; d < TYPIST_FALLOFF_PX; d += 50)
      expect(typistRate(d + 50)).toBeLessThan(typistRate(d));
  });

  it("sur écran tactile : selon la part du bouton JOUER visible", () => {
    expect(typistRateForVisibility(0)).toBe(1);
    expect(typistRateForVisibility(1)).toBe(2.5);
    expect(typistRateForVisibility(2)).toBe(2.5);
  });
});
