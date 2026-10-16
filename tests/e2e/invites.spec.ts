import { expect, test } from "@playwright/test";
import { createRoomViaApi, registerViaApi, uniqueName } from "./helpers";

// SALLE-04 / SALLE-10 : une salle privée n'est accessible que par lien d'invitation,
// à usage unique.
test("salle privée : le code seul est refusé, le lien d'invitation fonctionne une fois", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ locale: "fr-CA" });
  const host = await hostContext.newPage();
  await registerViaApi(host.request, "hote");
  const code = await createRoomViaApi(host.request, { access: "private" });
  await host.goto(`/jouer/${code}`);

  const inviteRes = await host.request.post(`/api/lobbies/${code}/invites`, {
    data: { label: "Camille" },
  });
  expect(inviteRes.ok(), await inviteRes.text()).toBe(true);
  const { invite } = (await inviteRes.json()) as { invite: { token: string } };

  // Sans invitation, le code ne suffit pas.
  const outsider = await browser.newContext({ locale: "fr-CA" });
  const outsiderPage = await outsider.newPage();
  await outsiderPage.request.post("/api/auth/guest", { data: { pseudo: uniqueName("ext") } });
  const denied = await outsiderPage.request.post(`/api/lobbies/${code}/join`, { data: {} });
  expect(denied.ok()).toBe(false);

  // Avec le lien, on entre (pseudo d'invité demandé).
  const guestContext = await browser.newContext({ locale: "fr-CA" });
  const guest = await guestContext.newPage();
  await guest.goto(`/rejoindre/${invite.token}`);
  const name = uniqueName("inv");
  await guest.getByLabel("Pseudonyme").fill(name);
  await guest.getByRole("button", { name: "CONTINUER" }).click();
  await expect(guest).toHaveURL(new RegExp(`/jouer/${code}$`), { timeout: 15_000 });
  await expect(host.getByText(name).first()).toBeVisible({ timeout: 15_000 });

  // Le lien est lié à l'adresse IP de la première personne : une autre adresse est refusée.
  const second = await browser.newContext({ locale: "fr-CA" });
  const secondPage = await second.newPage();
  await secondPage.request.post("/api/auth/guest", { data: { pseudo: uniqueName("deux") } });
  const reuse = await secondPage.request.post(`/api/invites/${invite.token}`, {
    headers: { "X-Forwarded-For": "203.0.113.77" },
  });
  expect(reuse.ok()).toBe(false);

  // Dans le navigateur, le refus propose de revenir à l'accueil (et non une page qui charge sans fin).
  const third = await browser.newContext({
    locale: "fr-CA",
    extraHTTPHeaders: { "X-Forwarded-For": "203.0.113.78" },
  });
  const thirdPage = await third.newPage();
  await thirdPage.request.post("/api/auth/guest", { data: { pseudo: uniqueName("trois") } });
  await thirdPage.goto(`/rejoindre/${invite.token}`);
  // Filtré par texte : l'annonceur de navigation de Next.js a aussi le rôle « alert ».
  await expect(thirdPage.getByRole("alert").filter({ hasText: "déjà été utilisé" })).toBeVisible({
    timeout: 15_000,
  });
  await thirdPage.getByRole("button", { name: "RETOUR A L'ACCUEIL" }).click();
  await expect(thirdPage).toHaveURL(/\/$/);

  await Promise.all([hostContext, outsider, guestContext, second, third].map((c) => c.close()));
});
