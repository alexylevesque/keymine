import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRaceTime,
} from "@/lib/format";

// I18N-03 : dates et nombres formatés selon la langue choisie.
describe("formatage localisé (I18N-03)", () => {
  it("formate les nombres avec le séparateur de la langue", () => {
    expect(formatNumber("fr", 1234.5, 1).replace(/\s/g, " ")).toBe("1 234,5");
    expect(formatNumber("en", 1234.5, 1)).toBe("1,234.5");
  });

  it("formate les pourcentages", () => {
    expect(formatPercent("fr", 97.5, 1).replace(/\s/g, " ")).toBe("97,5 %");
    expect(formatPercent("en", 97.5, 1)).toBe("97.5%");
  });

  it("formate les durées de course", () => {
    expect(formatRaceTime("fr", 67_400)).toBe("1 min 07,4 s");
    expect(formatRaceTime("en", 67_400)).toBe("1 min 07.4 s");
    expect(formatRaceTime("fr", 22_000)).toBe("22,0 s");
    expect(formatRaceTime("fr", 0)).toBe("0,0 s");
  });

  it("formate les dates dans la langue choisie", () => {
    const date = new Date("2026-03-04T15:30:00Z");
    expect(formatDate("fr", date)).toMatch(/mars/);
    expect(formatDate("en", date)).toMatch(/March/);
  });

  it("formate la durée maximale avec l'unité la plus grande qui tombe juste", () => {
    const plain = (text: string) => text.replace(/\s/g, " "); // espaces insécables → espace
    expect(plain(formatDuration("fr", 15))).toBe("15 secondes");
    expect(plain(formatDuration("fr", 60))).toBe("1 minute");
    expect(plain(formatDuration("fr", 300))).toBe("5 minutes");
    expect(plain(formatDuration("fr", 3600))).toBe("1 heure");
    expect(plain(formatDuration("en", 7200))).toBe("2 hours");
    expect(plain(formatDuration("en", 90))).toBe("90 seconds");
    // CONF-01 : 0 = aucun temps maximal.
    expect(formatDuration("fr", 0)).toBe("Sans limite");
    expect(formatDuration("en", 0)).toBe("No limit");
  });

  it("n'utilise que des espaces ordinaires pour la durée (sinon le serveur et le navigateur divergent à l'hydratation)", () => {
    for (const lang of ["fr", "en"] as const) {
      for (const seconds of [15, 30, 60, 120, 300, 3600]) {
        expect(formatDuration(lang, seconds)).toMatch(/^\d+ [a-z]+$/);
      }
    }
  });
});
