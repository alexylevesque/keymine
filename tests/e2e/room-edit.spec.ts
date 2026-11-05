import { expect, test } from "@playwright/test";
import { createRoomViaApi, registerViaApi } from "./helpers";

// CONF-12 : l'hôte modifie les réglages dans la salle ; fermer avec des changements non
// enregistrés demande quoi faire. SALLE-04 : un lien révoqué disparaît de la liste.

test("fermer l'éditeur sans changement ne demande rien, avec changement propose d'enregistrer", async ({
  page,
}) => {
  await registerViaApi(page.request, "edit");
  const code = await createRoomViaApi(page.request, { name: "Salle de test" });
  await page.goto(`/jouer/${code}`);
  const players = page.getByText(/^JOUEURS|PLAYERS/).first();
  await expect(players).toBeVisible();

  // Sans changement : fermeture directe, les joueurs reviennent.
  await page.getByRole("button", { name: "MODIFIER" }).click();
  const editor = page.getByTestId("settings-editor");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "FERMER", exact: true }).first().click();
  await expect(editor).toBeHidden();
  await expect(players).toBeVisible();

  // Avec changement + « Annuler » : tout est abandonné.
  await page.getByRole("button", { name: "MODIFIER" }).click();
  const name = page.getByRole("textbox", { name: "Nom de la salle" });
  await name.fill("Autre nom");
  await editor.getByRole("button", { name: "FERMER", exact: true }).last().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("enregistrer les modifications");
  await dialog.getByRole("button", { name: "ANNULER" }).click();
  await expect(editor).toBeHidden();
  await expect(players).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("SALLE DE TEST");

  // Avec changement + « Sauvegarder » : enregistré puis fermé.
  await page.getByRole("button", { name: "MODIFIER" }).click();
  await page.getByRole("textbox", { name: "Nom de la salle" }).fill("Autre nom");
  await editor.getByRole("button", { name: "FERMER", exact: true }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: "SAUVEGARDER" }).click();
  await expect(editor).toBeHidden();
  await expect(players).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AUTRE NOM");
});

test("un lien d'invitation révoqué disparaît de la liste", async ({ page }) => {
  await registerViaApi(page.request, "revoq");
  const code = await createRoomViaApi(page.request, {});
  await page.goto(`/jouer/${code}`);
  // Le panneau des liens d'invitation est replié : on l'ouvre.
  await page.getByText("LIENS D'INVITATION").click();
  await page.getByRole("textbox", { name: /Nom de l'invité|Guest name/i }).fill("Camille");
  await page.getByRole("button", { name: "GENERER" }).click();
  await expect(page.getByText("Camille")).toBeVisible();
  await page.getByRole("button", { name: /Révoquer|Revoke/ }).click();
  await expect(page.getByText("Camille")).toBeHidden();
  await expect(page.getByText("Révoqué")).toHaveCount(0);
});
