import { expect, test } from "@playwright/test";
import { createRoomViaApi, registerViaApi, uniqueName } from "./helpers";

// JOIN-01 : rejoindre par le champ de code de l'accueil.
test("le champ de code de l'accueil fait entrer dans la salle (JOIN-01)", async ({ browser }) => {
  const hostContext = await browser.newContext({ locale: "fr-CA" });
  const host = await hostContext.newPage();
  await registerViaApi(host.request, "hote");
  const code = await createRoomViaApi(host.request);

  const context = await browser.newContext({ locale: "fr-CA" });
  const page = await context.newPage();
  await registerViaApi(page.request, "code");
  await page.goto("/");
  await page.getByLabel("Code de la course").fill(code.toLowerCase());
  await page.getByRole("button", { name: "ENTRER" }).click();
  await expect(page).toHaveURL(new RegExp(`/jouer/${code}$`), { timeout: 15_000 });
  await hostContext.close();
  await context.close();
});

// SALLE-10 : 10 essais ratés par minute et par IP, puis 429. L'adresse vient du dernier
// X-Forwarded-For (celui qu'ajoute le reverse proxy) : chaque test simule donc sa propre adresse.
test("force brute sur le code : 429 après 10 essais ratés, par adresse IP (SALLE-10)", async ({
  request,
}) => {
  await registerViaApi(request, "brute");
  const ip = `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const tryCode = (code: string, from = ip) =>
    request.post(`/api/lobbies/${code}/join`, {
      data: {},
      headers: { "X-Forwarded-For": `1.2.3.4, ${from}` },
    });

  for (let i = 0; i < 10; i++) expect((await tryCode(`ZZ${i}Q9X`)).status()).toBe(404);
  const blocked = await tryCode("ZZZQ9X");
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBe("60");
  // Changer la première adresse de l'en-tête (celle que le client contrôle) ne contourne pas la limite.
  expect(
    (
      await request.post("/api/lobbies/ZZZQ9X/join", {
        data: {},
        headers: { "X-Forwarded-For": `9.9.9.9, ${ip}` },
      })
    ).status(),
  ).toBe(429);
  // Une autre adresse n'est pas touchée.
  expect((await tryCode("ZZZQ9X", "10.250.250.250")).status()).toBe(404);
});

// JOIN-02 : l'explorateur affiche les salles publiques, se filtre et se met à jour sans recharger.
test("l'explorateur se met à jour sans rechargement et se filtre par langue et complexité (JOIN-02)", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "fr-CA" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "LOBBYS PUBLICS" })).toBeVisible();

  // Une salle créée APRÈS l'ouverture de la page apparaît d'elle-même.
  const hostContext = await browser.newContext({ locale: "fr-CA" });
  const host = await hostContext.newPage();
  const { username } = await registerViaApi(host.request, "explo");
  const name = uniqueName("Explo");
  await createRoomViaApi(host.request, { name, language: "en", complexity: "hard", maxPlayers: 8 });
  const row = page.locator("li", { hasText: name });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText("EN · Difficile · En attente");
  await expect(row).toContainText(`hôte ${username}`);
  await expect(row.getByLabel("1 joueurs sur 8")).toBeVisible();

  const filters = page.getByRole("group", { name: "Filtres de l'explorateur" });
  await filters.getByRole("button", { name: "FR", exact: true }).click();
  await expect(row).toHaveCount(0);
  await filters.getByRole("button", { name: "EN", exact: true }).click();
  await expect(row).toBeVisible();
  await filters.getByRole("button", { name: "Facile", exact: true }).click();
  await expect(row).toHaveCount(0);
  await filters.getByRole("button", { name: "Difficile", exact: true }).click();
  await expect(row).toBeVisible();
  await hostContext.close();
  await context.close();
});

// JOIN-03 : « Faire une course ».
test("partie rapide : un compte entre dans une salle publique ouverte (JOIN-03)", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ locale: "fr-CA" });
  const host = await hostContext.newPage();
  await registerViaApi(host.request, "hote");
  await createRoomViaApi(host.request, { maxPlayers: 30 });

  const context = await browser.newContext({ locale: "fr-CA" });
  const page = await context.newPage();
  await registerViaApi(page.request, "rapide");
  await page.goto("/");
  await page.getByRole("button", { name: "JOUER", exact: true }).click();
  await expect(page).toHaveURL(/\/jouer\/[A-Z0-9]+$/, { timeout: 15_000 });
  await hostContext.close();
  await context.close();
});

test("partie rapide sans salle : un compte peut en créer une, un invité voit un état vide (JOIN-03)", async ({
  browser,
}) => {
  const none = (canCreate: boolean) => ({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({ error: "aucune", code: "none_available", canCreate }),
  });

  const userContext = await browser.newContext({ locale: "fr-CA" });
  const user = await userContext.newPage();
  await registerViaApi(user.request, "vide");
  await user.route("**/api/play/quick", (route) => route.fulfill(none(true)));
  await user.goto("/");
  await user.getByRole("button", { name: "JOUER", exact: true }).click();
  await expect(user.getByText("AUCUNE SALLE DISPONIBLE")).toBeVisible();
  await user.getByRole("button", { name: "CREER UNE SALLE PUBLIQUE" }).click();
  await expect(user).toHaveURL(/\/jouer\/[A-Z0-9]+$/, { timeout: 15_000 });
  await expect(user.getByRole("button", { name: "DEMARRER" })).toBeVisible(); // il en est l'hôte

  const guestContext = await browser.newContext({ locale: "fr-CA" });
  const guest = await guestContext.newPage();
  await guest.request.post("/api/auth/guest", { data: { pseudo: uniqueName("inv") } });
  await guest.route("**/api/play/quick", (route) => route.fulfill(none(false)));
  await guest.goto("/");
  await guest.getByRole("button", { name: "JOUER", exact: true }).click();
  await expect(guest.getByText("AUCUNE SALLE DISPONIBLE")).toBeVisible();
  await expect(guest.getByRole("button", { name: "CREER UNE SALLE PUBLIQUE" })).toHaveCount(0);

  await userContext.close();
  await guestContext.close();
});
