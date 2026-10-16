import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { mergeGuestHistory } from "@/lib/stats";

// Fusion de l'historique d'un invité dans un compte, à l'inscription ou à la
// connexion (register, login, OAuth). Hors cahier : vérifie que les courses
// jouées en invité deviennent celles du compte et que les statistiques suivent.
const client = new Client({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

const suffix = () => Math.random().toString(36).slice(2, 8);

async function newUser() {
  const { rows } = await client.query<{ id: string }>(
    `insert into users (username, password_hash, display_name) values ($1, 'x', 'Test') returning id`,
    [`m_${suffix()}`],
  );
  return rows[0].id;
}

async function newLobby(guestHost: string) {
  const { rows } = await client.query<{ id: string }>(
    `insert into lobbies (code, host_guest_id, name, status) values ($1, $2, 'm', 'finished') returning id`,
    [`M${suffix().toUpperCase().slice(0, 5)}`, guestHost],
  );
  return rows[0].id;
}

async function joinAsGuest(lobbyId: string, guestId: string) {
  await client.query(
    `insert into lobby_players (lobby_id, guest_id, guest_name, active) values ($1, $2, 'Invité', false)`,
    [lobbyId, guestId],
  );
}

async function joinAsUser(lobbyId: string, userId: string) {
  await client.query(
    `insert into lobby_players (lobby_id, user_id, active) values ($1, $2, false)`,
    [lobbyId, userId],
  );
}

/** Course terminée jouée par un invité (ou un compte) avec un MPM donné. */
async function guestRace(lobbyId: string, who: { guestId?: string; userId?: string }, wpm: number) {
  const { rows } = await client.query<{ id: string }>(
    `insert into races (lobby_id, text_content, language, status, starts_at, duration_seconds)
     values ($1, 'abc def', 'fr', 'finished', now(), 30) returning id`,
    [lobbyId],
  );
  await client.query(
    `insert into race_participants (race_id, user_id, guest_id, display_name, status, wpm, accuracy, rank,
       finish_ms, text_length, progress_chars, error_count, finished_at)
     values ($1, $2, $3, 'Invité', 'finished', $4, 95, 1, 12000, 7, 7, 2, now())`,
    [rows[0].id, who.userId ?? null, who.guestId ?? null, wpm],
  );
  return rows[0].id;
}

async function userRow(userId: string) {
  const { rows } = await client.query<{
    total_races: number;
    best_wpm: number;
    total_errors: number;
  }>(`select total_races, best_wpm, total_errors from users where id = $1`, [userId]);
  return rows[0];
}

describe("fusion de l'historique invité → compte", () => {
  it("donne au compte les courses de l'invité et recalcule ses statistiques", async () => {
    const guest = `g_${suffix()}`;
    const other = `g_${suffix()}`;
    const user = await newUser();
    const lobby = await newLobby(guest);
    await joinAsGuest(lobby, guest);
    await joinAsGuest(lobby, other);
    const r1 = await guestRace(lobby, { guestId: guest }, 42);
    const r2 = await guestRace(lobby, { guestId: guest }, 57);
    const foreign = await guestRace(lobby, { guestId: other }, 80);

    await mergeGuestHistory(guest, user);

    const mine = await client.query<{ race_id: string; guest_id: string | null }>(
      `select race_id, guest_id from race_participants where user_id = $1 order by wpm`,
      [user],
    );
    expect(mine.rows.map((r) => r.race_id)).toEqual([r1, r2]);
    expect(mine.rows.every((r) => r.guest_id === null)).toBe(true);

    const players = await client.query(`select 1 from lobby_players where user_id = $1`, [user]);
    expect(players.rowCount).toBe(1);
    const leftover = await client.query(`select 1 from race_participants where guest_id = $1`, [
      guest,
    ]);
    expect(leftover.rowCount).toBe(0);

    // La course de l'autre invité reste à lui.
    const theirs = await client.query<{ guest_id: string; user_id: string | null }>(
      `select guest_id, user_id from race_participants where race_id = $1`,
      [foreign],
    );
    expect(theirs.rows[0]).toEqual({ guest_id: other, user_id: null });

    const stats = await userRow(user);
    expect(stats.total_races).toBe(2);
    expect(stats.best_wpm).toBe(57);
    expect(stats.total_errors).toBe(4);
  });

  it("ajoute les courses de l'invité à celles que le compte avait déjà", async () => {
    const guest = `g_${suffix()}`;
    const user = await newUser();
    const lobby = await newLobby(guest);
    await guestRace(lobby, { userId: user }, 90);
    await guestRace(lobby, { guestId: guest }, 30);

    await mergeGuestHistory(guest, user);

    const stats = await userRow(user);
    expect(stats.total_races).toBe(2);
    expect(stats.best_wpm).toBe(90);
  });

  it("ne plante pas si le compte et l'invité étaient dans la même salle", async () => {
    const guest = `g_${suffix()}`;
    const user = await newUser();
    const lobby = await newLobby(guest);
    await joinAsGuest(lobby, guest);
    await joinAsUser(lobby, user);
    await guestRace(lobby, { guestId: guest }, 33);

    await expect(mergeGuestHistory(guest, user)).resolves.toBeUndefined();

    const players = await client.query(
      `select 1 from lobby_players where lobby_id = $1 and user_id = $2`,
      [lobby, user],
    );
    expect(players.rowCount).toBe(1);
    expect((await userRow(user)).total_races).toBe(1);
  });

  it("garde la salle active du compte si l'invité était actif ailleurs", async () => {
    const guest = `g_${suffix()}`;
    const user = await newUser();
    const guestLobby = await newLobby(guest);
    const userLobby = await newLobby(guest);
    await client.query(
      `insert into lobby_players (lobby_id, guest_id, guest_name, active) values ($1, $2, 'Invité', true)`,
      [guestLobby, guest],
    );
    await client.query(
      `insert into lobby_players (lobby_id, user_id, active) values ($1, $2, true)`,
      [userLobby, user],
    );

    await mergeGuestHistory(guest, user);

    const rows = await client.query<{ lobby_id: string; active: boolean }>(
      `select lobby_id, active from lobby_players where user_id = $1 order by active`,
      [user],
    );
    expect(rows.rows).toEqual([
      { lobby_id: guestLobby, active: false },
      { lobby_id: userLobby, active: true },
    ]);
  });

  it("ne change rien quand l'invité n'a jamais joué", async () => {
    const user = await newUser();
    await mergeGuestHistory(`g_${suffix()}`, user);
    expect((await userRow(user)).total_races).toBe(0);
  });
});
