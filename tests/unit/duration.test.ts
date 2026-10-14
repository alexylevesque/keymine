import { describe, expect, it } from "vitest";
import { DURATION_CHOICES, isValidDuration } from "@/lib/race/duration";
import { lobbySettingsSchema } from "@/lib/lobby-schema";

// CONF-01 : temps maximal « aucun », ou entre 30 secondes et 10 minutes.
describe("temps maximal d'une course (CONF-01)", () => {
  it("accepte aucun (0) ou 30 s à 10 min, refuse le reste", () => {
    for (const ok of [0, 30, 45, 300, 600]) expect(isValidDuration(ok)).toBe(true);
    for (const bad of [-1, 15, 29, 601, 3600, 7200, 30.5]) expect(isValidDuration(bad)).toBe(false);
  });

  it("le schéma de la salle applique la même règle", () => {
    expect(lobbySettingsSchema.safeParse({ durationSeconds: 0 }).success).toBe(true);
    expect(lobbySettingsSchema.safeParse({ durationSeconds: 15 }).success).toBe(false);
    expect(lobbySettingsSchema.safeParse({ durationSeconds: 7200 }).success).toBe(false);
  });

  it("le formulaire ne propose que des valeurs valides, dont « aucun »", () => {
    expect(DURATION_CHOICES[0]).toBe(0);
    expect(DURATION_CHOICES.every(isValidDuration)).toBe(true);
  });
});
