import { kysely as db } from "@/lib/db";
import type { BotLevel } from "@/db/types";

// CONF-10 : ajout et retrait de bots en salle d'attente.

export type BotChange = { ok: true } | { ok: false; reason: "not_waiting" | "full" | "not_found" };

export async function addBot(lobby: { id: string; status: string; max_players: number }, level: BotLevel): Promise<BotChange> {
  if (lobby.status !== "lobby") return { ok: false, reason: "not_waiting" };
  const count = await db
    .selectFrom("lobby_players")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("lobby_id", "=", lobby.id)
    .where("role", "=", "participant")
    .where("active", "=", true)
    .executeTakeFirst();
  if (Number(count?.n ?? 0) >= lobby.max_players) return { ok: false, reason: "full" };
  await db
    .insertInto("lobby_players")
    .values({ lobby_id: lobby.id, is_bot: true, bot_level: level, role: "participant" })
    .execute();
  return { ok: true };
}

export async function removeBot(lobby: { id: string; status: string }, playerId: string): Promise<BotChange> {
  if (lobby.status !== "lobby") return { ok: false, reason: "not_waiting" };
  const removed = await db
    .deleteFrom("lobby_players")
    .where("id", "=", playerId)
    .where("lobby_id", "=", lobby.id)
    .where("is_bot", "=", true)
    .executeTakeFirst();
  return Number(removed.numDeletedRows) > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}
