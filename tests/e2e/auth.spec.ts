import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { PASSWORD, registerViaApi, uniqueName } from "./helpers";

// TEST-03 : connexion par nom d'utilisateur et mot de passe (pas d'OAuth).
test("créer un compte, se déconnecter, se reconnecter", async ({ page }) => {
  const username = uniqueName("e2e");
  await page.goto("/connexion");
  await page.getByRole("button", { name: "CREER UN COMPTE" }).first().click();
  await page.getByLabel("NOM D'UTILISATEUR").fill(username);
  await page.getByLabel("MOT DE PASSE").fill(PASSWORD);
  await page.getByRole("button", { name: "CREER LE COMPTE" }).click();
  await expect(page).toHaveURL("/");
  // L'en-tête affiche le pseudo de la personne connectée et mène à son profil.
  await expect(page.getByRole("banner").getByRole("link", { name: username })).toHaveAttribute(
    "href",
    "/profil",
  );

  await page.goto("/profil");
  await expect(
    page.getByRole("main").getByText(username.toUpperCase(), { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "DECONNEXION" }).click();

  await page.goto("/connexion");
  await page.getByLabel("NOM D'UTILISATEUR").fill(username);
  await page.getByLabel("MOT DE PASSE").fill(PASSWORD);
  await page.getByRole("button", { name: "CONNEXION" }).last().click();
  await expect(page).toHaveURL("/");
  await page.goto("/profil");
  await expect(
    page.getByRole("main").getByText(username.toUpperCase(), { exact: true }),
  ).toBeVisible();
});

test("sans connexion, l'en-tête propose la connexion (« Invité »)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Invité" })).toHaveAttribute(
    "href",
    "/connexion",
  );
});

test("un mauvais mot de passe affiche un message d'erreur traduit", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("NOM D'UTILISATEUR").fill("personne-inconnue");
  await page.getByLabel("MOT DE PASSE").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "CONNEXION" }).last().click();
  await expect(page.getByText("Nom d'utilisateur ou mot de passe incorrect.")).toBeVisible();
});

test("un invité ne peut pas créer de salle (AUTH-03)", async ({ request }) => {
  await request.post("/api/auth/guest", { data: { pseudo: uniqueName("inv") } });
  const res = await request.post("/api/lobbies", { data: {} });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("account_required");
});

test("un invité voit un avatar généré à la place d'une photo (AUTH-03)", async ({ page }) => {
  await page.request.post("/api/auth/guest", { data: { pseudo: uniqueName("inv") } });
  await page.goto("/");
  const avatar = page.getByRole("banner").locator("[data-avatar]");
  await expect(avatar).toHaveAttribute("data-avatar", "generated");
  await expect(avatar.locator("rect").first()).toBeAttached();
});

// AUTH-05 : un vrai bouton (et non le champ fichier natif) permet de changer la photo.
test("le bouton « CHANGER LA PHOTO » ouvre le sélecteur et met la photo à jour", async ({
  page,
}) => {
  await registerViaApi(page.request, "photo");
  await page.goto("/profil");
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#3d6fc4" } })
    .png()
    .toBuffer();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "CHANGER LA PHOTO" }).click();
  await (await chooser).setFiles({ name: "photo.png", mimeType: "image/png", buffer: png });

  await expect(page.getByText("Photo mise à jour.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retirer la photo" })).toBeVisible();
});

test("les erreurs OAuth sont traduites et un texte libre dans l'URL n'est jamais affiché (I18N-01)", async ({
  page,
}) => {
  await page.goto("/connexion?error=oauth_failed&provider=github");
  await expect(page.getByText("Échec de la connexion GitHub. Réessaie.")).toBeVisible();

  await page.goto("/connexion?error=Ton%20compte%20est%20suspendu");
  await expect(page.getByRole("button", { name: "CONNEXION" }).last()).toBeVisible();
  await expect(page.getByText("Ton compte est suspendu")).toHaveCount(0);

  // Sans identifiants OAuth (environnement de test), le bouton renvoie un code d'erreur connu.
  const res = await page.request.get("/api/auth/discord/start", { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.headers()["location"]).toContain("/connexion?error=oauth_not_configured&provider=discord");
});
