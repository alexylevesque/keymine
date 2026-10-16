import { expect, test } from "@playwright/test";
import { registerViaApi } from "./helpers";

// DES-06 : aucune page ne déborde horizontalement, de 320 px au grand écran (zoom du navigateur
// compris : zoomer revient à réduire la largeur en pixels CSS), et aucun bouton ne coupe son texte.
const WIDTHS = [320, 360, 414, 600, 768, 900, 1024, 1280];

test("aucun débordement horizontal ni texte qui sort des boutons, de 320 px à 1280 px", async ({ page }) => {
  test.setTimeout(120_000);
  await registerViaApi(page.request, "large");
  for (const path of ["/", "/jouer/creer", "/profil", "/historique", "/connexion", "/inventaire", "/boutique", "/classement"]) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        const root = document.documentElement;
        if (root.scrollWidth > root.clientWidth) out.push(`page ${root.scrollWidth} > ${root.clientWidth}`);
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a.pixel-btn, .pixel-chip"))) {
          if (el.offsetParent === null) continue;
          if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
            out.push(`bouton « ${(el.textContent ?? "").trim().slice(0, 20)} »`);
          }
        }
        return out;
      });
      expect(problems, `${path} à ${width} px`).toEqual([]);
    }
  }
});

test("menu hamburger sous 1024 px : logo, compte et menu ; navigation complète au-dessus", async ({ page }) => {
  await registerViaApi(page.request, "burger");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/profil");
  const toggle = page.getByRole("button", { name: "Ouvrir le menu" });
  await expect(toggle).toBeVisible();
  await expect(page.getByRole("link", { name: "JOUER" })).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Langue du site" })).toBeHidden();

  await toggle.click();
  await expect(page.getByRole("button", { name: "Fermer le menu" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", { name: "JOUER" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Langue du site" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "JOUER" })).toBeHidden();
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.getByRole("link", { name: "JOUER" }).click();
  await expect(page).toHaveURL(/\/jouer\/creer$/);
  await expect(page.getByRole("button", { name: "Ouvrir le menu" })).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByRole("button", { name: /le menu/ })).toBeHidden();
  await expect(page.getByRole("link", { name: "LOBBYS" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Langue du site" })).toBeVisible();
});
