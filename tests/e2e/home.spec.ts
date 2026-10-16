import { expect, test } from "@playwright/test";

test("l'accueil affiche le titre, la partie rapide, le code et l'explorateur de salles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /tape plus vite/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "JOUER" })).toBeVisible();
  await expect(page.getByLabel("Code de la course")).toBeVisible();
  await expect(page.getByRole("heading", { name: "LOBBYS PUBLICS" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).first()).toBeAttached();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("le sélecteur de langue traduit l'interface et le choix est conservé (I18N-02)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.getByRole("combobox", { name: "Langue du site" }).selectOption("en");
  await expect(page.getByRole("heading", { level: 1, name: /type faster/i })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: /type faster/i })).toBeVisible();
  await expect(page).toHaveTitle(/KeyMine/);
});

test("le thème est choisi avant le premier affichage et reste après rechargement (DES-05)", async ({ browser }) => {
  const light = await browser.newContext({ colorScheme: "light", locale: "fr-CA" });
  const lightPage = await light.newPage();
  await lightPage.goto("/");
  await expect(lightPage.locator("html")).toHaveAttribute("data-theme", "light");
  await lightPage.getByRole("button", { name: "Thème clair ou sombre" }).click();
  await expect(lightPage.locator("html")).toHaveAttribute("data-theme", "dark");
  await lightPage.reload();
  await expect(lightPage.locator("html")).toHaveAttribute("data-theme", "dark");
  await light.close();

  const dark = await browser.newContext({ colorScheme: "dark", locale: "fr-CA" });
  const darkPage = await dark.newPage();
  await darkPage.goto("/");
  await expect(darkPage.locator("html")).toHaveAttribute("data-theme", "dark");
  await dark.close();
});

test("la page est utilisable à 360 px de large, sans défilement horizontal (DES-06)", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "fr-CA" });
  const page = await context.newPage();
  for (const path of ["/", "/connexion", "/profil", "/historique"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} déborde de ${overflow}px`).toBeLessThanOrEqual(0);
  }
  await context.close();
});
