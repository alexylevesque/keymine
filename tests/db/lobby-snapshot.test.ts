import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { loadLobbySnapshot, viewLobby } from "@/lib/lobby-snapshot";

// AUTH-04 : la photo d'un compte apparaît aussi dans la salle d'attente ; invités et bots n'en ont pas.
const client = new Client({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

describe("photos des joueurs dans l'état de la salle", () => {
  it("transmet la photo des comptes, rien pour les invités et les bots", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const { rows: users } = await client.query<{ id: string }>(
      `insert into users (username, password_hash, display_name, avatar_url) values
         ($1, 'x', 'Avec photo', 'https://cdn.example/a.png'),
         ($2, 'x', 'Sans photo', null)
       returning id`,
      [`photo_${suffix}`, `nophoto_${suffix}`],
    );
    const code = `P${suffix.toUpperCase().slice(0, 5)}`;
    const { rows } = await client.query<{ id: string }>(
      `insert into lobbies (code, host_user_id, name) values ($1, $2, 'photos') returning id`,
      [code, users[0]!.id],
    );
    const lobby = rows[0]!.id;
    await client.query(
      `insert into lobby_players (lobby_id, user_id, joined_at) values ($1, $2, now() - interval '3 minutes'), ($1, $3, now() - interval '2 minutes')`,
      [lobby, users[0]!.id, users[1]!.id],
    );
    await client.query(
      `insert into lobby_players (lobby_id, guest_id, guest_name, joined_at) values ($1, $2, 'Invité', now() - interval '1 minute')`,
      [lobby, `g-${suffix}`],
    );
    await client.query(`insert into lobby_players (lobby_id, is_bot, bot_level) values ($1, true, 'noob')`, [lobby]);

    const view = viewLobby((await loadLobbySnapshot(code))!, null);
    expect(view.players.map((p) => p.avatarUrl)).toEqual(["https://cdn.example/a.png", null, null, null]);
  });
});
