import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { kysely as db } from "@/lib/db";
import { createLobby, settingsFromLobby } from "@/lib/lobby-create";
import { lobbySettingsSchema } from "@/lib/lobby-schema";

// REJOUER (historique) : une salle recréée à partir d'une autre garde les mêmes réglages, l'hôte y entre.
const client = new Client({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => {
  await client.connect();
});
afterAll(async () => {
  await client.end();
  await db.destroy();
});

describe("création et clonage d'une salle", () => {
  it("recrée une salle aux mêmes réglages, avec un nouveau code et l'hôte dedans", async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const userId = (
      await client.query<{ id: string }>(
        `insert into users (username, password_hash, display_name) values ($1, 'x', 'Hote') returning id`,
        [`lc_${suffix}`],
      )
    ).rows[0].id;

    const settings = lobbySettingsSchema.parse({
      name: "Ma salle",
      access: "unlisted",
      maxPlayers: 8,
      durationSeconds: 90,
      language: "en",
      textType: "aleatoire",
      textLength: 25,
      complexity: "hard",
      uppercase: true,
      punctuation: true,
      digits: true,
      accents: false,
      includeChars: ["z", "@", "("],
      excludeChars: ["e", "'"],
      accentWanted: ["aigu", "cedille"],
      accentForbidden: ["trema"],
      bonusKinds: ["minus_words", "fog"],
      errorMode: "bloquer",
      penaltySeconds: 2.5,
      comebackBonus: true,
    });
    const firstCode = await createLobby(userId, { ...settings, name: "Ma salle" });
    const first = await db
      .selectFrom("lobbies")
      .selectAll()
      .where("code", "=", firstCode)
      .executeTakeFirstOrThrow();

    // On ne peut être que dans une salle à la fois (SALLE-06) : on quitte la première avant de la cloner.
    await client.query(`delete from lobby_players where lobby_id = $1`, [first.id]);
    const cloneCode = await createLobby(userId, settingsFromLobby(first));
    const clone = await db
      .selectFrom("lobbies")
      .selectAll()
      .where("code", "=", cloneCode)
      .executeTakeFirstOrThrow();

    expect(cloneCode).not.toBe(firstCode);
    expect(settingsFromLobby(clone)).toEqual(settingsFromLobby(first));
    expect(settingsFromLobby(clone)).toEqual({ ...settings, hostRole: "participant" });
    expect(clone).toMatchObject({ host_user_id: userId, status: "lobby" });
    const members = await db
      .selectFrom("lobby_players")
      .selectAll()
      .where("lobby_id", "=", clone.id)
      .execute();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ user_id: userId, role: "participant", active: true });
  });
});
