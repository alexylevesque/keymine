import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { addBotViaApi, createRoomViaApi, registerViaApi } from "./helpers";

// A11Y-01 / A11Y-04 : aucune violation axe de gravité « serious » ou « critical »
// (contrastes, noms accessibles, structure) dans les deux thèmes.
const PAGES = ["/", "/connexion", "/jouer/creer"];
const THEMES = ["dark", "light"] as const;

for (const theme of THEMES) {
  for (const path of PAGES) {
    test(`axe : ${path} (thème ${theme})`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme: theme, locale: "fr-CA" });
      const page = await context.newPage();
      await registerViaApi(page.request);
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        blocking.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
      await context.close();
    });
  }
}

for (const theme of THEMES) {
  test(`axe : profil et historique (compte connecté, thème ${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: theme, locale: "fr-CA" });
    const page = await context.newPage();
    await registerViaApi(page.request);
    for (const path of ["/profil", "/historique"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        blocking.map((v) => `${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
    }
    await context.close();
  });
}

// A11Y-01 / A11Y-03 : salle d'attente, course en cours et résultats, dans les deux thèmes. En plus des
// violations graves, aucune image sans texte alternatif ni champ sans libellé, quelle que soit la gravité.
const ALWAYS = new Set(["image-alt", "label", "button-name", "link-name", "input-image-alt", "svg-img-alt"]);

for (const theme of THEMES) {
  test(`axe : salle d'attente, course et résultats (thème ${theme})`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ colorScheme: theme, locale: "fr-CA" });
    const page = await context.newPage();
    await registerViaApi(page.request, "axe");
    const code = await createRoomViaApi(page.request, { durationSeconds: 30, textLength: 10 });
    await addBotViaApi(page.request, code, "noob");

    const audit = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical" || ALWAYS.has(v.id),
      );
      expect(
        blocking.map((v) => `${label} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
      ).toEqual([]);
    };

    await page.goto(`/jouer/${code}`);
    await expect(page.getByRole("button", { name: "DEMARRER" })).toBeVisible();
    await audit("salle");

    await page.getByRole("button", { name: "DEMARRER" }).click();
    await expect(page).toHaveURL(new RegExp(`/course/${code}`), { timeout: 15_000 });
    await expect(page.getByRole("group", { name: "Texte à taper" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("La course commence…")).toBeHidden({ timeout: 15_000 });
    await audit("course");

    await expect(page).toHaveURL(new RegExp(`/resultats/${code}`), { timeout: 40_000 });
    await expect(page.getByRole("table")).toBeVisible();
    await audit("résultats");
    await context.close();
  });
}

// A11Y-04 : parcours au clavier avec focus visible, du lien d'évitement à la création d'une salle.
test("parcours au clavier : lien d'évitement, focus visible, création d'une salle", async ({ page }) => {
  await registerViaApi(page.request, "clavier");
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  // Chaque élément atteint par Tab dans l'en-tête affiche un indicateur de focus.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "aucun";
      const s = getComputedStyle(el);
      return s.outlineStyle !== "none" && s.outlineWidth !== "0px" ? "visible" : `${el.tagName}: ${s.outlineStyle}`;
    });
    expect(outline).toBe("visible");
  }

  // Le lien d'évitement mène au contenu principal.
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenu$/);

  // Créer une salle uniquement au clavier.
  await page.goto("/jouer/creer");
  const submit = page.getByRole("button", { name: /CREER/ });
  await submit.focus();
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/jouer\/[A-Z0-9]+$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "DEMARRER" })).toBeVisible();
});
