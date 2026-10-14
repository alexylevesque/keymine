import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discordUserResponse,
  githubUserResponse,
  inviteTokenSchema,
  lobbyCodeSchema,
  oauthCallbackQuery,
  parseSearchParams,
} from "@/lib/api-input";
import { generateInviteToken } from "@/lib/invite-token";

describe("schémas des entrées hors JSON (TECH-07)", () => {
  it("code de salle : alphanumérique, mis en majuscules, refuse le reste", () => {
    expect(lobbyCodeSchema.parse(" ab3x9k ")).toBe("AB3X9K");
    for (const bad of ["", "AB-12", "x".repeat(17), "ÉCOLE", "1' or 1=1"]) {
      expect(lobbyCodeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("jeton d'invitation : accepte les jetons générés, refuse les autres", () => {
    expect(inviteTokenSchema.safeParse(generateInviteToken()).success).toBe(true);
    expect(inviteTokenSchema.safeParse("court").success).toBe(false);
    expect(inviteTokenSchema.safeParse("a".repeat(42) + "!").success).toBe(false);
  });

  it("retour OAuth : code et state obligatoires", () => {
    expect(parseSearchParams("https://x.test/cb?code=abc&state=def", oauthCallbackQuery)).toEqual({
      code: "abc",
      state: "def",
    });
    expect(parseSearchParams("https://x.test/cb?code=abc", oauthCallbackQuery)).toBeNull();
    expect(parseSearchParams("https://x.test/cb?error=access_denied", oauthCallbackQuery)).toBeNull();
  });

  it("réponses des fournisseurs : forme minimale exigée", () => {
    expect(discordUserResponse.safeParse({ id: "123", username: "a", avatar: null }).success).toBe(true);
    expect(discordUserResponse.safeParse({ id: 123, username: "a", avatar: null }).success).toBe(false);
    expect(githubUserResponse.safeParse({ id: 5, login: "a", avatar_url: "https://x" }).success).toBe(true);
    expect(githubUserResponse.safeParse({ login: "a" }).success).toBe(false);
  });
});

// Audit statique : toute route API qui lit une entrée (corps, formulaire, paramètres d'URL ou de
// requête) la fait passer par un schéma Zod, directement ou via un utilitaire qui valide.
const API_DIR = path.join(import.meta.dirname, "..", "..", "app", "api");
function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}
const READS_INPUT = /request\.(json|formData|text)\(\)|await params|searchParams\.get|nextUrl/;
const VALIDATES = /from "zod"|from "@\/lib\/api-input"|from "@\/lib\/lobby-schema"|getLobbyByCode\(|publicLobbyFilters/;

describe("audit des routes API (TECH-07)", () => {
  const files = routes(API_DIR);
  it("trouve les routes", () => {
    expect(files.length).toBeGreaterThan(20);
  });
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!READS_INPUT.test(src)) continue;
    it(`${path.relative(API_DIR, file)} valide ses entrées`, () => {
      expect(src).toMatch(VALIDATES);
    });
  }
});
