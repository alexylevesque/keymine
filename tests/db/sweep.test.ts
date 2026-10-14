import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { handOverHostDuringRace, sweepLobbies } from "@/lib/lobby-sweep";

// SALLE-08 : l'hôte parti est remplacé par le compte connecté présent depuis
// le plus longtemps ; s'il n'en reste aucun, la salle est fermée.
const client = new Client({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
});

async function user(name: string) {
  const { rows } = await client.query<{ id: string }>(
    `insert into users (username, password_hash, display_name) values ($1, 'x', $1) returning id`,
    [`${name}_${Math.random().toString(36).slice(2, 8)}`],
  );
  return rows[0].id;
}

async function lobbyWithAbsentHost() {
  const host = await user("hote");
  const code = `S${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { rows } = await client.query<{ id: string }>(
    `insert into lobbies (code, host_user_id, name, last_host_seen_at)
     values ($1, $2, 'sweep', now() - interval '5 minutes') returning id`,
    [code, host],
  );
  await client.query(
    `insert into lobby_players (lobby_id, user_id, joined_at, last_seen_at)
     values ($1, $2, now() - interval '10 minutes', now() - interval '5 minutes')`,
    [rows[0].id, host],
  );
  return { host, lobby: rows[0].id };
}

describe("balayage des salles (SALLE-08)", () => {
  it("transfère l'hôte au plus ancien compte encore présent, en ignorant invités et absents", async () => {
    const { host, lobby } = await lobbyWithAbsentHost();
    const absent = await user("absent");
    const newcomer = await user("recent");
    const veteran = await user("ancien");
    await client.query(
      `insert into lobby_players (lobby_id, user_id, joined_at, last_seen_at) values
        ($1, $2, now() - interval '9 minutes', now() - interval '5 minutes'),
        ($1, $3, now() - interval '1 minute', now()),
        ($1, $4, now() - interval '3 minutes', now())`,
      [lobby, absent, newcomer, veteran],
    );
    await client.query(
      `insert into lobby_players (lobby_id, guest_id, guest_name, joined_at) values ($1, $2, 'Invité', now() - interval '20 minutes')`,
      [lobby, `g-vieux-${Math.random().toString(36).slice(2, 8)}`],
    );

    await sweepLobbies();
    const { rows } = await client.query(`select host_user_id, host_guest_id, status from lobbies where id = $1`, [lobby]);
    expect(rows[0]).toMatchObject({ host_user_id: veteran, host_guest_id: null, status: "lobby" });
    expect(rows[0].host_user_id).not.toBe(host);
  });

  it("ferme la salle s'il ne reste aucune personne connectée et libère les absents", async () => {
    const { host, lobby } = await lobbyWithAbsentHost();
    await sweepLobbies();
    const { rows } = await client.query(`select status from lobbies where id = $1`, [lobby]);
    expect(rows[0].status).toBe("closed");
    // l'hôte est libéré : il peut rejoindre une autre salle
    const other = await client.query(
      `insert into lobbies (code, host_user_id, name) values ($1, $2, 'autre') returning id`,
      [`T${Math.random().toString(36).slice(2, 7).toUpperCase()}`, host],
    );
    await expect(
      client.query(`insert into lobby_players (lobby_id, user_id) values ($1, $2)`, [other.rows[0].id, host]),
    ).resolves.toBeDefined();
  });

  it("ne touche pas une salle dont l'hôte est présent", async () => {
    const host = await user("present");
    const { rows } = await client.query<{ id: string }>(
      `insert into lobbies (code, host_user_id, name) values ($1, $2, 'ok') returning id`,
      [`U${Math.random().toString(36).slice(2, 7).toUpperCase()}`, host],
    );
    await client.query(`insert into lobby_players (lobby_id, user_id) values ($1, $2)`, [rows[0].id, host]);
    await sweepLobbies();
    const check = await client.query(`select status from lobbies where id = $1`, [rows[0].id]);
    expect(check.rows[0].status).toBe("lobby");
  });

  it("sur l'écran des résultats, un hôte absent est aussi remplacé", async () => {
    const { lobby } = await lobbyWithAbsentHost();
    await client.query(`update lobbies set status = 'finished' where id = $1`, [lobby]);
    const present = await user("resultats");
    await client.query(
      `insert into lobby_players (lobby_id, user_id, joined_at, last_seen_at) values ($1, $2, now() - interval '2 minutes', now())`,
      [lobby, present],
    );
    await sweepLobbies();
    const { rows } = await client.query(`select host_user_id, status from lobbies where id = $1`, [lobby]);
    expect(rows[0]).toMatchObject({ host_user_id: present, status: "finished" });
  });
});

async function racingLobby() {
  const host = await user("hote_course");
  const code = `R${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const { rows } = await client.query<{ id: string }>(
    `insert into lobbies (code, host_user_id, name, status) values ($1, $2, 'course', 'racing') returning id`,
    [code, host],
  );
  await client.query(
    `insert into lobby_players (lobby_id, user_id, joined_at) values ($1, $2, now() - interval '10 minutes')`,
    [rows[0].id, host],
  );
  return { host, lobby: rows[0].id };
}

describe("hôte qui quitte pendant une course (SALLE-08)", () => {
  it("passe le rôle au plus ancien compte encore dans la salle, spectateurs compris", async () => {
    const { host, lobby } = await racingLobby();
    const spectator = await user("spectateur");
    const racer = await user("coureur");
    await client.query(
      `insert into lobby_players (lobby_id, user_id, role, joined_at, last_seen_at) values
        ($1, $2, 'spectator', now() - interval '8 minutes', now() - interval '8 minutes'),
        ($1, $3, 'participant', now() - interval '2 minutes', now())`,
      [lobby, spectator, racer],
    );
    await client.query(`update lobby_players set active = false where lobby_id = $1 and user_id = $2`, [lobby, host]);

    expect(await handOverHostDuringRace(lobby, host)).toBe("transferred");
    const { rows } = await client.query(`select host_user_id, status from lobbies where id = $1`, [lobby]);
    expect(rows[0]).toMatchObject({ host_user_id: spectator, status: "racing" });
  });

  it("ne ferme pas la course s'il ne reste que des invités", async () => {
    const { host, lobby } = await racingLobby();
    await client.query(
      `insert into lobby_players (lobby_id, guest_id, guest_name) values ($1, $2, 'Invité')`,
      [lobby, `g-${Math.random().toString(36).slice(2, 8)}`],
    );
    await client.query(`update lobby_players set active = false where lobby_id = $1 and user_id = $2`, [lobby, host]);

    expect(await handOverHostDuringRace(lobby, host)).toBe("kept");
    const { rows } = await client.query(`select host_user_id, status from lobbies where id = $1`, [lobby]);
    expect(rows[0]).toMatchObject({ host_user_id: host, status: "racing" });
  });

  it("ignore un joueur qui n'est pas l'hôte", async () => {
    const { host, lobby } = await racingLobby();
    const other = await user("autre");
    await client.query(`insert into lobby_players (lobby_id, user_id) values ($1, $2)`, [lobby, other]);
    expect(await handOverHostDuringRace(lobby, other)).toBe("kept");
    const { rows } = await client.query(`select host_user_id from lobbies where id = $1`, [lobby]);
    expect(rows[0].host_user_id).toBe(host);
  });
});
