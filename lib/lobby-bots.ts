import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbyPlayers } from "@/db/schema";
import type { BotLevel } from "@/db/types";

// CONF-10 : ajout et retrait de bots en salle d'attente.

export type BotChange = { ok: true } | { ok: false; reason: "not_waiting" | "full" | "not_found" };

export async function addBot(
  lobby: { id: string; status: string; max_players: number },
  level: BotLevel,
): Promise<BotChange> {
  if (lobby.status !== "lobby") return { ok: false, reason: "not_waiting" };
  const count = await db.$count(
    lobbyPlayers,
    and(
      eq(lobbyPlayers.lobby_id, lobby.id),
      eq(lobbyPlayers.role, "participant"),
      eq(lobbyPlayers.active, true),
    ),
  );
  if (count >= lobby.max_players) return { ok: false, reason: "full" };
  await db
    .insert(lobbyPlayers)
    .values({ lobby_id: lobby.id, is_bot: true, bot_level: level, role: "participant" });
  return { ok: true };
}

export async function removeBot(
  lobby: { id: string; status: string },
  playerId: string,
): Promise<BotChange> {
  if (lobby.status !== "lobby") return { ok: false, reason: "not_waiting" };
  const removed = await db
    .delete(lobbyPlayers)
    .where(
      and(
        eq(lobbyPlayers.id, playerId),
        eq(lobbyPlayers.lobby_id, lobby.id),
        eq(lobbyPlayers.is_bot, true),
      ),
    );
  return (removed.rowCount ?? 0) > 0 ? { ok: true } : { ok: false, reason: "not_found" };
}
