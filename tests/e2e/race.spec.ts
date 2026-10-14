import { expect, test, type Page } from "@playwright/test";
import { addBotViaApi, createRoomViaApi, joinAsGuest, registerViaApi, uniqueName } from "./helpers";

/**
 * Attend la fin du décompte puis tape le texte affiché. Les bonus peuvent allonger le texte en
 * cours de course (« +3 mots ») : on relit donc le texte après chaque tranche tapée, jusqu'à ce
 * que la page des résultats s'affiche.
 */
async function typeWholeText(page: Page, code: string) {
  const box = page.getByRole("group", { name: "Texte à taper" });
  await expect(box).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("La course commence…")).toBeHidden({ timeout: 15_000 });
  let typed = 0;
  for (let round = 0; round < 40 && !page.url().includes(`/resultats/${code}`); round++) {
    const text = (await box.textContent().catch(() => null)) ?? "";
    if (text.length > typed) {
      // `press` (et non `type`) pour l'ASCII ; les caractères hors clavier US (é, œ, ’…) sont envoyés
      // comme un évènement keydown, sinon la page ne les voit pas.
      for (const char of text.slice(typed)) {
        if (/^[\x20-\x7e]$/.test(char)) await page.keyboard.press(char);
        else
          await page.evaluate(
            (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
            char,
          );
      }
      typed = text.length;
    } else {
      await page.waitForTimeout(250);
    }
  }
}

test("course complète : hôte + invité + bot, résultats, rejouer (COURSE-03/04/05, RES-01, COURSE-11)", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ locale: "fr-CA" });
  const guestContext = await browser.newContext({ locale: "fr-CA" });
  const host = await hostContext.newPage();
  await registerViaApi(host.request, "hote");
  const code = await createRoomViaApi(host.request, {
    textLength: 10,
    durationSeconds: 30,
    comebackBonus: false,
  });
  await addBotViaApi(host.request, code, "noob");
  await host.goto(`/jouer/${code}`);

  const guestName = uniqueName("inv");
  const guest = await joinAsGuest(guestContext, code, guestName);
  await expect(host.getByText(guestName).first()).toBeVisible();

  await host.getByRole("button", { name: "DEMARRER" }).click();
  await expect(host).toHaveURL(new RegExp(`/course/${code}`), { timeout: 15_000 });
  await expect(guest).toHaveURL(new RegExp(`/course/${code}`), { timeout: 15_000 });

  await Promise.all([typeWholeText(host, code), typeWholeText(guest, code)]);

  await expect(host).toHaveURL(new RegExp(`/resultats/${code}`), { timeout: 30_000 });
  await expect(guest).toHaveURL(new RegExp(`/resultats/${code}`), { timeout: 30_000 });
  // Le classement est un vrai tableau (A11Y-03).
  await expect(host.getByRole("table")).toBeVisible();
  await expect(host.getByRole("table")).toContainText(guestName);
  // Les résultats sont complets dès l'arrivée sur la page : une courbe de MPM par coureur (RES-03).
  await expect(host.locator("figure svg polyline")).toHaveCount(3);

  // L'hôte relance avec les mêmes participants.
  await host.getByRole("button", { name: "REJOUER" }).click();
  await expect(host).toHaveURL(new RegExp(`/jouer/${code}$`), { timeout: 15_000 });
  await expect(host.getByText(guestName).first()).toBeVisible();
  // L'invité, resté sur les résultats, revient tout seul dans la salle (COURSE-11).
  await expect(guest).toHaveURL(new RegExp(`/jouer/${code}$`), { timeout: 15_000 });

  await hostContext.close();
  await guestContext.close();
});

test("l'hôte expulse un invité : il est redirigé hors de la salle et ne peut pas revenir (SALLE-07)", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ locale: "fr-CA" });
  const guestContext = await browser.newContext({ locale: "fr-CA" });
  const host = await hostContext.newPage();
  await registerViaApi(host.request, "hote");
  const code = await createRoomViaApi(host.request);
  await host.goto(`/jouer/${code}`);
  const guestName = uniqueName("inv");
  const guest = await joinAsGuest(guestContext, code, guestName);

  await host.getByRole("button", { name: `Expulser ${guestName}` }).click();
  await expect(guest).not.toHaveURL(new RegExp(`/jouer/${code}$`), { timeout: 15_000 });

  // Banni : il ne peut pas revenir avec le code.
  const retry = await guestContext.request.post(`/api/lobbies/${code}/join`, { data: {} });
  expect(retry.ok()).toBe(false);

  await hostContext.close();
  await guestContext.close();
});

test("les réglages modifiés par l'hôte se mettent à jour en direct chez l'invité (SALLE-03)", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ locale: "fr-CA" });
  const guestContext = await browser.newContext({ locale: "fr-CA" });
  const host = await hostContext.newPage();
  await registerViaApi(host.request, "hote");
  const code = await createRoomViaApi(host.request, { textLength: 10 });
  await host.goto(`/jouer/${code}`);
  const guest = await joinAsGuest(guestContext, code, uniqueName("inv"));
  await expect(guest.getByText("10 mots")).toBeVisible();

  const res = await host.request.patch(`/api/lobbies/${code}`, { data: { textLength: 25 } });
  expect(res.ok(), await res.text()).toBe(true);
  await expect(guest.getByText("25 mots")).toBeVisible({ timeout: 10_000 });

  await hostContext.close();
  await guestContext.close();
});

test("marteler le clavier est pénalisé : la pénalité s'ajoute au temps d'arrivée", async ({
  page,
}) => {
  await registerViaApi(page.request, "martel");
  const code = await createRoomViaApi(page.request, {
    textLength: 10,
    durationSeconds: 30,
    comebackBonus: false,
    errorMode: "accumuler",
    penaltySeconds: 1,
  });
  await addBotViaApi(page.request, code, "noob");
  await page.goto(`/jouer/${code}`);
  await page.getByRole("button", { name: "DEMARRER" }).click();
  await expect(page).toHaveURL(new RegExp(`/course/${code}`), { timeout: 15_000 });
  await expect(page.getByRole("group", { name: "Texte à taper" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("La course commence…")).toBeHidden({ timeout: 15_000 });

  // « § » n'apparaît dans aucun texte : chaque frappe est une erreur, mais le curseur avance quand même.
  for (let i = 0; i < 400 && !page.url().includes(`/resultats/${code}`); i++) {
    await page.evaluate(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "§", bubbles: true })),
    );
    await page.waitForTimeout(60);
  }

  await expect(page).toHaveURL(new RegExp(`/resultats/${code}`), { timeout: 30_000 });
  await expect(page.getByRole("table")).toContainText("de pénalité");

  // Classement ouvert ; évolution du MPM et clavier thermique repliés jusqu'à ce qu'on les ouvre.
  const chart = page.locator("figure");
  await expect(chart).toBeHidden();
  await page.getByRole("heading", { name: "EVOLUTION DU MPM" }).click();
  await expect(chart).toBeVisible();
  const heatmap = page.getByRole("group", { name: /HEATMAP DU CLAVIER/ });
  await expect(heatmap).toBeHidden();
  await page
    .getByText(/HEATMAP DU CLAVIER/)
    .first()
    .click();
  await expect(heatmap).toBeVisible();

  // Stats : la course récente y figure avec les mêmes infos et les mêmes boutons que dans l'historique.
  await page.goto("/profil");
  const recent = page.getByRole("list", { name: "HISTORIQUE" }).getByRole("listitem");
  await expect(recent).toHaveCount(1);
  await expect(recent).toContainText("Jouée");
  for (const name of ["DETAILS", "REJOUER", "SUPPRIMER"]) {
    await expect(recent.getByRole(name === "DETAILS" ? "link" : "button", { name })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "VOIR TOUT L'HISTORIQUE" })).toBeVisible();

  // HIST-01 : la course figure dans l'historique (section « Courses » par défaut), avec des champs
  // étiquetés ; on peut la supprimer.
  await page.getByRole("link", { name: "VOIR TOUT L'HISTORIQUE" }).click();
  await expect(page).toHaveURL(/\/historique/);
  await expect(page.getByRole("link", { name: /^COURSES \(1\)/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const card = page.getByRole("listitem").filter({ hasText: "DATE" });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("RANG");
  await expect(card).toContainText("MPM");
  await expect(card).toContainText("PRECISION");
  await page.getByRole("button", { name: "SUPPRIMER" }).click();
  await expect(
    page.getByRole("dialog", { name: "Supprimer cette course de ton historique ?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ANNULER" }).click();
  await expect(card).toHaveCount(1); // annuler ne supprime rien
  await page.getByRole("button", { name: "SUPPRIMER" }).click();
  await page.getByRole("button", { name: "OUI, SUPPRIMER" }).click();
  await expect(page.getByText("Aucune course terminée pour l'instant.")).toBeVisible();
});

// COURSE-07 : après un abandon, retour à la liste des lobbys ; on ne revient pas dans la course abandonnée.
test("abandonner ramène à la liste des lobbys et ferme la porte de cette course", async ({
  page,
}) => {
  await registerViaApi(page.request, "abandon");
  const code = await createRoomViaApi(page.request, {
    textLength: 10,
    durationSeconds: 30,
    comebackBonus: false,
  });
  await addBotViaApi(page.request, code, "noob");
  await page.goto(`/jouer/${code}`);
  await page.getByRole("button", { name: "DEMARRER" }).click();
  await expect(page).toHaveURL(new RegExp(`/course/${code}`), { timeout: 15_000 });
  await expect(page.getByText("La course commence…")).toBeHidden({ timeout: 20_000 });

  await page.getByRole("button", { name: "ABANDONNER", exact: true }).click();
  await page.getByRole("button", { name: "OUI, ABANDONNER" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  // Revenir sur l'adresse de la course renvoie aussitôt aux lobbys.
  await page.goto(`/course/${code}`);
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  // Une fois la course finie, elle figure dans la section « abandons » de l'historique ;
  // REJOUER ouvre une nouvelle salle (on n'était plus dans l'ancienne) avec les mêmes réglages.
  await expect(async () => {
    await page.goto("/historique?section=abandoned");
    await expect(page.getByRole("listitem").filter({ hasText: "DATE" })).toHaveCount(1, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 45_000 });
  await page.getByRole("button", { name: "REJOUER" }).click();
  await expect(page).toHaveURL(/\/jouer\/[A-Z0-9]+$/, { timeout: 15_000 });
  expect(page.url()).not.toContain(code);
});
