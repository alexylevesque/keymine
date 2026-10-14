import { expect, test, type Page } from "@playwright/test";
import { addBotViaApi, createRoomViaApi, registerViaApi } from "./helpers";

const WRONG = "span.bg-\\[\\#b0281c\\]";
const RIGHT = "span.text-\\[\\#7fd36a\\]";

/** Crée une salle (compte + bot), lance la course et attend la fin du décompte. */
async function startRace(page: Page, settings: Record<string, unknown> = {}) {
  await registerViaApi(page.request, "flux");
  const code = await createRoomViaApi(page.request, {
    durationSeconds: 60,
    textLength: 10,
    ...settings,
  });
  await addBotViaApi(page.request, code, "noob");
  await page.goto(`/jouer/${code}`);
  await page.getByRole("button", { name: "DEMARRER" }).click();
  await expect(page).toHaveURL(new RegExp(`/course/${code}`), { timeout: 15_000 });
  const box = page.getByRole("group", { name: "Texte à taper" });
  await expect(box).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("La course commence…")).toBeHidden({ timeout: 15_000 });
  return { code, box };
}

async function cursorIndex(page: Page) {
  return page
    .getByRole("group", { name: "Texte à taper" })
    .locator("span")
    .evaluateAll((spans) => spans.findIndex((s) => s.className.includes("f0b429")));
}

function wrongKeyFor(expected: string) {
  return expected.toLowerCase() === "q" ? "x" : "q";
}

async function pressChar(page: Page, char: string) {
  if (/^[\x20-\x7e]$/.test(char)) await page.keyboard.press(char);
  else
    await page.evaluate(
      (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
      char,
    );
}

// CONF-08 : en mode « bloquer », une erreur ne fait pas avancer ; en mode « accumuler », elle reste en rouge.
test("mode bloquer : une mauvaise touche n'avance pas, la bonne avance (CONF-08)", async ({
  page,
}) => {
  const { box } = await startRace(page, { errorMode: "bloquer" });
  await expect(page.getByText("Bloqué tant que la bonne touche n'est pas tapée.")).toBeVisible();
  const text = (await box.textContent())!;
  expect(await cursorIndex(page)).toBe(0);

  await pressChar(page, wrongKeyFor(text[0]!));
  await page.waitForTimeout(200);
  expect(await cursorIndex(page)).toBe(0);
  await expect(box.locator(WRONG)).toHaveCount(0);

  await pressChar(page, text[0]!);
  await expect.poll(() => cursorIndex(page)).toBe(1);
  await expect(box.locator(RIGHT)).toHaveCount(1);
});

test("mode accumuler : une mauvaise touche avance et reste marquée en rouge (CONF-08, COURSE-04)", async ({
  page,
}) => {
  const { box } = await startRace(page, { errorMode: "accumuler" });
  const text = (await box.textContent())!;
  await pressChar(page, wrongKeyFor(text[0]!));
  await expect.poll(() => cursorIndex(page)).toBe(1);
  await expect(box.locator(WRONG)).toHaveCount(1);
  await pressChar(page, text[1]!);
  await expect.poll(() => cursorIndex(page)).toBe(2);
  await expect(box.locator(RIGHT)).toHaveCount(1);
  // Le collage est bloqué.
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "abcdef");
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  });
  await page.waitForTimeout(200);
  expect(await cursorIndex(page)).toBe(2);
});

// COURSE-08 : recharger la page pendant la course ramène au même endroit.
test("recharger la page pendant la course garde l'avancement (COURSE-08)", async ({ page }) => {
  const { code, box } = await startRace(page);
  const text = (await box.textContent())!;
  for (const char of text.slice(0, 5)) await pressChar(page, char);
  await expect.poll(() => cursorIndex(page)).toBe(5);
  await page.waitForTimeout(400); // laisse partir le dernier envoi groupé (100 ms)

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/course/${code}`));
  await expect(page.getByRole("group", { name: "Texte à taper" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => cursorIndex(page), { timeout: 10_000 }).toBe(5);
  await expect(page.getByRole("group", { name: "Texte à taper" }).locator(RIGHT)).toHaveCount(5);
});

// SALLE-01 / CONF-10 : création par le formulaire en spectateur, bots ajoutés et retirés dans l'interface.
test("créer une salle en spectateur, ajouter puis retirer un bot (SALLE-01, CONF-10)", async ({
  page,
}) => {
  const { username } = await registerViaApi(page.request, "specta");
  await page.goto("/jouer/creer");
  await page.getByRole("button", { name: /SPECTATEUR/ }).click();
  await page.getByRole("button", { name: "CREER LA SALLE" }).click();
  await expect(page).toHaveURL(/\/jouer\/[A-Z0-9]+$/, { timeout: 15_000 });

  await expect(page.getByText("1 spectateurs")).toBeVisible();
  await expect(page.getByRole("list", { name: "Spectateurs" })).toContainText(username);

  const removeButtons = page.getByRole("button", { name: /^Retirer Bot / });
  const before = await removeButtons.count();
  await page.getByRole("button", { name: "+ NOOB" }).click();
  await expect(page.getByText("Bot Noob")).toBeVisible();
  await expect(removeButtons).toHaveCount(before + 1);
  await page.getByRole("button", { name: "Retirer Bot Noob" }).click();
  await expect(page.getByText("Bot Noob")).toHaveCount(0);
  await expect(removeButtons).toHaveCount(before);

  // Le choix de rôle est conservé au retour dans la salle.
  await page.reload();
  await expect(page.getByRole("list", { name: "Spectateurs" })).toContainText(username);
});

// BONUS-03 / BONUS-04 : le bonus est annoncé sur la piste et chez le joueur ciblé, et le texte du meneur
// s'allonge sans casser la progression.
test("un bonus « +3 mots » est annoncé sur la piste et chez le meneur ciblé (BONUS-03)", async ({
  page,
}) => {
  const { box } = await startRace(page, {
    textLength: 20,
    bonusKinds: ["plus_words"],
    comebackBonus: true,
  });
  const text = (await box.textContent())!;
  const target = Math.ceil(text.length * 0.3);
  // À vitesse humaine (≈ 100 MPM) : le serveur refuse les sauts impossibles (COURSE-06).
  for (const char of text.slice(0, target)) {
    await pressChar(page, char);
    await page.waitForTimeout(110);
  }

  await expect(page.getByText("BONUS ADVERSE : tu dois taper 3 mots de plus !")).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText(/Bot Noob reçoit « \+3 mots »/)).toBeVisible();
  await expect
    .poll(async () => ((await box.textContent()) ?? "").length)
    .toBeGreaterThan(text.length);
  // L'avancement déjà tapé est conservé.
  expect(await cursorIndex(page)).toBe(target);
});

// TECH-06 / PERF-02 : pendant la course, l'avancement part au serveur par paquets (pas un message par
// frappe) et le dernier état tapé finit toujours par partir, même sans atteindre la fin du texte.
test("l'avancement est envoyé au serveur par paquets, sans perdre la dernière frappe (TECH-06)", async ({
  page,
}) => {
  const sent: { progressChars: number }[] = [];
  page.on("websocket", (ws) =>
    ws.on("framesent", (frame) => {
      const data = JSON.parse(String(frame.payload)) as { type?: string; progressChars?: number };
      if (data.type === "progress") sent.push({ progressChars: data.progressChars! });
    }),
  );
  const { box } = await startRace(page, { textLength: 20 });
  const text = (await box.textContent())!;
  const typed = 25;
  for (const char of text.slice(0, typed)) await pressChar(page, char);
  await expect.poll(() => sent.at(-1)?.progressChars, { timeout: 3_000 }).toBe(typed);
  expect(sent.length).toBeLessThan(typed); // regroupé
  expect(sent.length).toBeGreaterThan(1);
});

// I18N-02 : le sélecteur de langue est aussi sur la page de course, et la frappe continue après.
test("changer de langue pendant la course, puis continuer à taper (I18N-02)", async ({ page }) => {
  const { box } = await startRace(page);
  const text = (await box.textContent())!;
  await page.getByRole("combobox", { name: "Langue du site" }).selectOption("en");
  await expect(page.getByText("TIME LEFT")).toBeVisible();
  const typingBox = page.getByRole("group", { name: "Text to type" });
  await pressChar(page, text[0]!);
  await expect
    .poll(() =>
      typingBox
        .locator("span")
        .evaluateAll((s) => s.findIndex((x) => x.className.includes("f0b429"))),
    )
    .toBe(1);
  await page.getByRole("combobox", { name: "Site language" }).selectOption("fr");
  await expect(page.getByText("TEMPS RESTANT")).toBeVisible();
});

// CONF-01 : temps maximal « aucun » ou de 30 s à 10 min.
test("course sans temps maximal : le chronomètre compte le temps écoulé (CONF-01)", async ({ page }) => {
  await startRace(page, { durationSeconds: 0 });
  await expect(page.getByText("TEMPS ECOULE")).toBeVisible();
  await expect(page.getByText("TEMPS RESTANT")).toHaveCount(0);
});

test("le formulaire propose « Sans limite » puis de 30 s à 10 min (CONF-01)", async ({ page }) => {
  await registerViaApi(page.request, "duree");
  await page.goto("/jouer/creer");
  const select = page.getByRole("combobox", { name: /durée/i });
  const options = await select.locator("option").allTextContents();
  expect(options[0]).toBe("Sans limite");
  expect(options.at(-1)).toMatch(/^10\sminutes$/);
  expect(options).not.toContain("15 secondes");
});
