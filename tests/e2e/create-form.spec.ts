import { expect, test } from "@playwright/test";
import { createRoomViaApi, registerViaApi } from "./helpers";

// CONF-06, CONF-07, CONF-09 : formulaire de création (bonus par type, accents par type,
// cartes de lettres et de symboles à trois états).

test("le formulaire de création enregistre bonus, accents, lettres et symboles choisis", async ({
  page,
}) => {
  await registerViaApi(page.request, "forme");
  await page.goto("/jouer/creer");

  // Bonus : on ne garde que le brouillard.
  await page.getByRole("button", { name: /^-3 MOTS/ }).click();
  await page.getByRole("button", { name: /^\+3 MOTS/ }).click();

  await page.getByRole("button", { name: /ALEATOIRE/ }).click();
  await page.getByRole("button", { name: "Ponctuation" }).click();
  await page.getByRole("button", { name: "Accents", exact: true }).click(); // décochés par défaut

  // Lettres : Z souvent (1 clic), E jamais (2 clics), K : 3 clics = retour au neutre.
  const letters = page.getByRole("group", { name: "LETTRES" });
  await letters.getByRole("button", { name: /^Z : / }).click();
  await letters.getByRole("button", { name: /^E : / }).click({ clickCount: 2 });
  await letters.getByRole("button", { name: /^K : / }).click({ clickCount: 3 });
  await expect(letters.getByRole("button", { name: "Z : souvent" })).toBeVisible();
  await expect(letters.getByRole("button", { name: "E : jamais" })).toBeVisible();
  await expect(letters.getByRole("button", { name: "K : neutre" })).toBeVisible();

  // Symboles : @ souvent, l'apostrophe jamais.
  const symbols = page.getByRole("group", { name: "SYMBOLES" });
  await symbols.getByRole("button", { name: /^@ : / }).click();
  await symbols.getByRole("button", { name: /^' : / }).click({ clickCount: 2 });

  // Accents : cédille souvent, tréma jamais.
  const accents = page.getByRole("group", { name: "TYPES D'ACCENTS" });
  await accents.getByRole("button", { name: /^CEDILLE : / }).click();
  await accents.getByRole("button", { name: /^TREMA : / }).click({ clickCount: 2 });

  // L'aperçu respecte les choix : jamais de « e », jamais de tréma.
  const preview = page.getByTestId("text-preview");
  await expect(preview).not.toHaveText("…");
  // L'aperçu attend que les réglages se calment (anti-saccade) : on laisse l'assertion réessayer.
  await expect(preview).not.toHaveText(/[eEëï]/, { timeout: 10_000 });

  await page.getByRole("button", { name: "CREER LA SALLE" }).click();
  await page.waitForURL(/\/jouer\/[A-Z0-9]{6}/);
  const code = page.url().split("/").pop()!;

  const lobby = await (await page.request.get(`/api/lobbies/${code}`)).json();
  expect(lobby.lobby).toMatchObject({
    textType: "aleatoire",
    punctuation: true,
    comebackBonus: true,
    bonusKinds: ["fog"],
    includeChars: ["z", "@"],
    excludeChars: ["e", "'"],
    accentWanted: ["cedille"],
    accentForbidden: ["trema"],
  });
});

test("décocher tous les types de bonus coupe l'interrupteur général", async ({ page }) => {
  await registerViaApi(page.request, "bonus");
  await page.goto("/jouer/creer");
  const master = page.getByRole("checkbox", { name: "Bonus de remontée activés" });
  await expect(master).toBeChecked();
  for (const name of [/^-3 MOTS/, /^\+3 MOTS/, /^BROUILLARD/]) {
    await page.getByRole("button", { name }).click();
  }
  await expect(master).not.toBeChecked();
  await expect(page.getByRole("button", { name: /^BROUILLARD/ })).toBeDisabled();
  await master.check();
  await expect(page.getByRole("button", { name: /^BROUILLARD/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^-3 MOTS/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("en texte cohérent, tout est grisé : le passage est tapé tel qu'écrit (CONF-06, CONF-07)", async ({
  page,
}) => {
  await registerViaApi(page.request, "coher");
  await page.goto("/jouer/creer");
  // Par défaut : texte cohérent, aucune option cochée.
  for (const name of ["Ponctuation", "Accents", "Nombres", "Majuscules"]) {
    const chip = page.getByRole("button", { name, exact: true });
    await expect(chip).toBeDisabled();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
  }
  await expect(
    page.getByRole("group", { name: "LETTRES" }).getByRole("button", { name: /^Q : / }),
  ).toBeDisabled();
  await expect(page.getByRole("group", { name: "TYPES D'ACCENTS" })).toHaveCount(0);
  await expect(page.getByText("Vrais passages : le texte est tapé tel qu'écrit")).toBeVisible();

  // En texte aléatoire, les options redeviennent actives, sauf les accents en anglais.
  await page.getByRole("button", { name: /ALEATOIRE/ }).click();
  await expect(page.getByRole("button", { name: "Accents", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accents", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ponctuation", exact: true })).toBeEnabled();
});

test("la langue du texte part de la langue du site (CONF-02)", async ({ page }) => {
  await registerViaApi(page.request, "langue");
  await page.goto("/jouer/creer");
  await expect(page.getByRole("button", { name: "FR", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("combobox", { name: "Langue du site" }).selectOption("en");
  await page.goto("/jouer/creer");
  await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Toujours modifiable.
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(page.getByRole("button", { name: "FR", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Salle par défaut (partie rapide sans salle) : même règle côté serveur.
  const res = await page.request.post("/api/lobbies", { data: {} });
  expect(res.ok()).toBe(true);
  const { code } = (await res.json()) as { code: string };
  const lobby = await page.request.get(`/api/lobbies/${code}`);
  expect(((await lobby.json()) as { lobby: { language: string } }).lobby.language).toBe("en");
});

// SALLE-06 : dans une salle, la page de création ne montre pas le formulaire.
test("déjà dans une salle : pas de formulaire, on retourne dans la salle ou on la quitte", async ({
  page,
}) => {
  await registerViaApi(page.request, "dejala");
  const code = await createRoomViaApi(page.request, {});
  await page.goto("/jouer/creer");
  await expect(page.getByRole("heading", { name: "TU ES DEJA DANS UNE SALLE" })).toBeVisible();
  await expect(page.getByText(code)).toBeVisible();
  await expect(page.getByRole("button", { name: "CREER LA SALLE" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "RETOURNER A LA SALLE" })).toHaveAttribute(
    "href",
    `/jouer/${code}`,
  );

  await page.getByRole("button", { name: "QUITTER LA SALLE" }).click();
  await expect(page.getByRole("button", { name: "CREER LA SALLE" })).toBeVisible();
});

// Nom de salle : proposé d'avance, obligatoire, contrôlé par le serveur.
test("le nom de la salle est proposé, obligatoire et filtré", async ({ page }) => {
  const { username } = await registerViaApi(page.request, "nomsalle");
  await page.goto("/jouer/creer");
  const name = page.getByRole("textbox", { name: "Nom de la salle" });
  await expect(name).toHaveValue(/^Salle de /);

  await name.fill("ab");
  await expect(page.getByRole("alert").filter({ hasText: "au moins 3 caractères" })).toBeVisible();
  await page.getByRole("button", { name: "CREER LA SALLE" }).click();
  await expect(page).toHaveURL(/\/jouer\/creer/); // refusé, on reste sur le formulaire

  await name.fill("<b>salle</b>");
  await expect(page.getByRole("alert").filter({ hasText: "Lettres, chiffres" })).toBeVisible();
  await name.fill("quelle m3rde");
  await expect(
    page.getByRole("alert").filter({ hasText: "mot qui n'est pas permis" }),
  ).toBeVisible();

  await name.fill("Les  Champions");
  await page.getByRole("button", { name: "CREER LA SALLE" }).click();
  await page.waitForURL(/\/jouer\/[A-Z0-9]{6}/);
  const code = page.url().split("/").pop()!;
  const lobby = await (await page.request.get(`/api/lobbies/${code}`)).json();
  expect(lobby.lobby.name).toBe("Les Champions");
  expect(username).toBeTruthy();
});

test("l'API refuse un nom interdit et en propose un quand il manque", async ({ page }) => {
  await registerViaApi(page.request, "nomapi");
  const refused = await page.request.post("/api/lobbies", {
    data: { name: "<script>alert(1)</script>" },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error).toMatch(/Lettres, chiffres|Letters, digits/);
  const created = await page.request.post("/api/lobbies", { data: {} });
  expect(created.ok()).toBe(true);
  const { code } = await created.json();
  const lobby = await (await page.request.get(`/api/lobbies/${code}`)).json();
  expect(lobby.lobby.name).toMatch(/^(Salle de|Room of) /);
  expect(lobby.lobby.name).not.toMatch(/sans nom/i);
});
