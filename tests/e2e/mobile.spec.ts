import { expect, test } from "@playwright/test";
import { addBotViaApi, createRoomViaApi, registerViaApi } from "./helpers";

// DES-06 : toutes les pages sont utilisables à 360 px de large ; sur mobile, la course est
// remplacée par un message recommandant un clavier physique.
test("360 px : salle d'attente, profil, historique et course (message clavier physique)", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, locale: "fr-CA", hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await registerViaApi(page.request, "mob");
  const code = await createRoomViaApi(page.request, { durationSeconds: 30 });
  await addBotViaApi(page.request, code, "noob");

  async function expectNoHorizontalScroll(path: string) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} déborde de ${overflow}px`).toBeLessThanOrEqual(0);
  }

  for (const path of [`/jouer/${code}`, "/profil", "/historique", "/jouer/creer"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalScroll(path);
  }

  await page.goto(`/jouer/${code}`);
  await page.getByRole("button", { name: "DEMARRER" }).click();
  await expect(page).toHaveURL(new RegExp(`/course/${code}`), { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "UN CLAVIER PHYSIQUE EST RECOMMANDE" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Texte à taper" })).toHaveCount(0);
  await expectNoHorizontalScroll("course");

  // Le lien vers les résultats est proposé ; une fois la course terminée (15 s), la page est lisible sur mobile.
  await expect(page.getByRole("link", { name: "VOIR LES RESULTATS" })).toHaveAttribute("href", `/resultats/${code}`);
  await expect(async () => {
    await page.goto(`/resultats/${code}`);
    await expect(page.getByRole("table")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 45_000, intervals: [2_000] });
  await expectNoHorizontalScroll("résultats");
  await context.close();
});
