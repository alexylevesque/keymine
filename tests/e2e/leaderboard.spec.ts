import { expect, test } from "@playwright/test";
import { guestViaApi, registerViaApi } from "./helpers";

// Classement (fonctionnalité ajoutée) : onglets du classement général, classes de la semaine, page
// ouverte aux invités. Les prix, montées et descentes sont testés en base (tests/db/leaderboard.test.ts).

test("un compte voit le classement général, change d'onglet et de classe", async ({ page }) => {
  await registerViaApi(page.request, "lb");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/classement");
  await expect(page.getByRole("heading", { name: "CLASSEMENT", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "GENERAL" }).click();
  await expect(page.getByRole("tab", { name: "NIVEAU" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "MEILLEUR MPM" }).click();
  await expect(page.getByRole("tab", { name: "MEILLEUR MPM" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("columnheader", { name: "Meilleur MPM" })).toBeVisible();

  await page.getByRole("tab", { name: "MA CLASSE" }).click();
  await expect(page.getByText(/fin dans/)).toBeVisible();
  await expect(page.getByRole("button", { name: /BRONZE/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Joue une course cette semaine", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "NETHERITE" }).click();
  await expect(page.getByRole("button", { name: "NETHERITE" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("un invité voit le classement et une invitation à créer un compte", async ({ page }) => {
  await guestViaApi(page.request, "InviteLb");
  await page.goto("/classement");
  await expect(
    page.getByText("Crée un compte pour avoir une classe", { exact: false }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/leaderboard", { data: { rewardId: crypto.randomUUID() } })
    ).status(),
  ).toBe(401);
});
