import { expect, test } from "@playwright/test";
import { guestViaApi, registerViaApi } from "./helpers";

// Inventaire et boutique (fonctionnalité ajoutée) : liens de navigation, boutique du jour, fiche (i)
// d'un objet et inventaire d'un nouveau compte. L'achat, le craft et le four sont testés en base
// (tests/db/inventory.test.ts).

test("un compte voit INVENTAIRE et BOUTIQUE, 6 offres et la fiche (i) d'un objet", async ({ page }) => {
  await registerViaApi(page.request, "inv");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/boutique");
  await expect(page.getByRole("link", { name: "INVENTAIRE" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "BOUTIQUE" })).toBeVisible();
  await expect(page.getByText(/Nouvelles offres dans \d\d:\d\d:\d\d/)).toBeVisible();

  // Nouveau compte : 0 XP, rien n'est achetable, et la page dit combien il manque.
  const buy = page.getByRole("button", { name: "ACHETER" });
  await expect(buy).toHaveCount(6);
  for (const button of await buy.all()) await expect(button).toBeDisabled();
  await expect(page.getByText(/Il te manque \d+ XP/).first()).toBeVisible();

  // Le (i) ouvre une fiche avec l'effet, la rareté et le prix ; Échap la ferme.
  await page.getByRole("button", { name: /^Informations : / }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^Rareté : /)).toBeVisible();
  await expect(dialog.getByText(/XP/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "INVENTAIRE" }).click();
  await expect(page.getByRole("heading", { name: "INVENTAIRE" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^sac, case 27 : case vide$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Tête, case 1 : case vide$/ })).toBeVisible();
  await expect(page.getByText("Le four est éteint", { exact: false })).toBeVisible();
});

test("un invité n'a ni inventaire ni boutique : on l'invite à créer un compte", async ({ page }) => {
  await guestViaApi(page.request, "InviteInv");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/inventaire");
  await expect(page.getByText("Il faut un compte pour avoir un inventaire", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "BOUTIQUE" })).toHaveCount(0);
  await page.goto("/boutique");
  await expect(page.getByText("Il faut un compte pour acheter", { exact: false })).toBeVisible();
  expect((await page.request.get("/api/shop")).status()).toBe(401);
});
