import { expect, test } from "@playwright/test";
import { addBotViaApi, createRoomViaApi, guestViaApi, registerViaApi, uniqueName } from "./helpers";

// SEC-01 : toutes les actions réservées à l'hôte sont autorisées côté serveur (l'interface ne
// suffit pas). Un invité de la salle et une personne non connectée reçoivent un refus.
test("les actions d'hôte sont refusées à un joueur ordinaire et aux anonymes (SEC-01)", async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const hostRequest = hostContext.request;
  await registerViaApi(hostRequest, "hote");
  const code = await createRoomViaApi(hostRequest, { access: "public" });
  await addBotViaApi(hostRequest, code);

  // Un invité entre dans la salle.
  const guestContext = await browser.newContext();
  const guest = guestContext.request;
  await guestViaApi(guest, uniqueName("inv"));
  const joined = await guest.post(`/api/lobbies/${code}/join`, { data: {} });
  expect(joined.ok(), await joined.text()).toBe(true);

  const anonymousContext = await browser.newContext();
  const anonymous = anonymousContext.request;

  const botRes = await hostRequest.get(`/api/lobbies/${code}`);
  const lobby = (await botRes.json()) as { players?: { id: string; isBot?: boolean }[] };
  const someId = lobby.players?.[0]?.id ?? "00000000-0000-4000-8000-000000000000";

  const actions: { name: string; call: (r: typeof guest) => Promise<{ status(): number }> }[] = [
    { name: "démarrer", call: (r) => r.post(`/api/lobbies/${code}/start`) },
    {
      name: "configurer",
      call: (r) => r.patch(`/api/lobbies/${code}`, { data: { textLength: 30 } }),
    },
    { name: "fermer", call: (r) => r.delete(`/api/lobbies/${code}`) },
    {
      name: "ajouter un bot",
      call: (r) => r.post(`/api/lobbies/${code}/bots`, { data: { level: "expert" } }),
    },
    {
      name: "retirer un bot",
      call: (r) => r.delete(`/api/lobbies/${code}/bots`, { data: { playerId: someId } }),
    },
    { name: "générer un lien", call: (r) => r.post(`/api/lobbies/${code}/invites`, { data: {} }) },
    { name: "lister les liens", call: (r) => r.get(`/api/lobbies/${code}/invites`) },
    {
      name: "expulser",
      call: (r) => r.post(`/api/lobbies/${code}/kick`, { data: { playerId: someId } }),
    },
    { name: "rejouer", call: (r) => r.post(`/api/lobbies/${code}/rematch`) },
  ];

  for (const action of actions) {
    const asGuest = await action.call(guest);
    expect([401, 403], `${action.name} (joueur ordinaire) : ${asGuest.status()}`).toContain(
      asGuest.status(),
    );
    const asAnonymous = await action.call(anonymous);
    expect([401, 403], `${action.name} (anonyme) : ${asAnonymous.status()}`).toContain(
      asAnonymous.status(),
    );
  }

  // Rien n'a changé : la salle est toujours ouverte avec ses réglages d'origine.
  const after = await hostRequest.get(`/api/lobbies/${code}`);
  expect(after.ok()).toBe(true);

  await Promise.all([hostContext, guestContext, anonymousContext].map((c) => c.close()));
});
