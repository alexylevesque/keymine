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

  // La photo remplace l'avatar généré dans l'en-tête ; le serveur la sert ré-encodée en WebP 256 px.
  const header = page.getByRole("banner").locator("[data-avatar]");
  await expect(header).toHaveAttribute("data-avatar", "photo");
  const src = await header.locator("img").getAttribute("src");
  const served = await page.request.get(src!);
  expect(served.headers()["content-type"]).toBe("image/webp");
  const meta = await sharp(await served.body()).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);

  // La photo apparaît aussi dans la liste des joueurs de la salle d'attente.
  const created = await page.request.post("/api/lobbies", { data: {} });
  const { code } = (await created.json()) as { code: string };
  await page.goto(`/jouer/${code}`);
  await expect(page.locator("main [data-avatar]").first()).toHaveAttribute("data-avatar", "photo");
  await page.request.post(`/api/lobbies/${code}/leave`);
  await page.goto("/profil");

  // Retirer la photo ramène l'avatar généré.
  await page.getByRole("button", { name: "Retirer la photo" }).click();
  await expect(header).toHaveAttribute("data-avatar", "generated");
});

// SEC-02 / AUTH-04 : le serveur vérifie le type réel et la taille, quoi qu'en dise le navigateur.
test("un fichier déguisé ou trop lourd est refusé par le serveur (SEC-02)", async ({ page }) => {
  await registerViaApi(page.request, "televers");
  const upload = (name: string, mimeType: string, buffer: Buffer) =>
    page.request.post("/api/profile/avatar", { multipart: { file: { name, mimeType, buffer } } });

  const fake = await upload("photo.png", "image/png", Buffer.from("<script>alert(1)</script>".repeat(10)));
  expect(fake.status()).toBe(415);

  const gif = await upload("anim.png", "image/png", Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "binary"));
  expect(gif.status()).toBe(415);

  const big = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000" } }).png().toBuffer();
  const tooLarge = await upload("lourd.png", "image/png", Buffer.concat([big, Buffer.alloc(2 * 1024 * 1024)]));
  expect(tooLarge.status()).toBe(413);

  const missing = await page.request.post("/api/profile/avatar", { multipart: { autre: "x" } });
  expect(missing.status()).toBe(400);
});

// AUTH-05 : changer son nom d'affichage depuis le profil.
test("changer son pseudonyme depuis le profil (AUTH-05)", async ({ page }) => {
  await registerViaApi(page.request, "renom");
  await page.goto("/profil");
  const newName = uniqueName("Nouv");
  await page.getByLabel("PSEUDONYME").fill(newName);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.getByText("Pseudonyme enregistré.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: newName.toUpperCase() })).toBeVisible();

  // Trop court : refusé côté serveur aussi.
  const res = await page.request.patch("/api/profile", { data: { displayName: "ab" } });
  expect(res.status()).toBe(400);
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
