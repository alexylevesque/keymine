import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

export const PASSWORD = "motdepasse-e2e";

/** Nom unique de 3 à 20 caractères (lettres/chiffres), pour ne jamais réutiliser un compte. */
export function uniqueName(prefix: string): string {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return `${prefix}${suffix}`.slice(0, 20);
}

/** Crée un compte par l'API (le cookie de session reste dans le contexte du navigateur). */
export async function registerViaApi(request: APIRequestContext, prefix = "joueur") {
  const username = uniqueName(prefix);
  const res = await request.post("/api/auth/register", { data: { username, password: PASSWORD } });
  expect(res.ok(), await res.text()).toBe(true);
  return { username, password: PASSWORD };
}

export async function guestViaApi(request: APIRequestContext, pseudo: string) {
  const res = await request.post("/api/auth/guest", { data: { pseudo } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Crée une salle (compte connecté) et renvoie son code. */
export async function createRoomViaApi(
  request: APIRequestContext,
  settings: Record<string, unknown> = {},
) {
  const res = await request.post("/api/lobbies", {
    data: { access: "public", durationSeconds: 60, textLength: 10, language: "fr", ...settings },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { code: string }).code;
}

export async function addBotViaApi(request: APIRequestContext, code: string, level = "noob") {
  const res = await request.post(`/api/lobbies/${code}/bots`, { data: { level } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Un second joueur (nouveau contexte de navigateur) qui entre dans la salle comme invité. */
export async function joinAsGuest(
  context: BrowserContext,
  code: string,
  pseudo: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/jouer/${code}`);
  await page.getByLabel("Pseudonyme").fill(pseudo);
  await page.getByRole("button", { name: "CONTINUER" }).click();
  await expect(page.getByText(pseudo).first()).toBeVisible({ timeout: 15_000 });
  return page;
}
