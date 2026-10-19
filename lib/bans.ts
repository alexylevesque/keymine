import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbyBans, lobbyPlayers } from "@/db/schema";
import type { Identity } from "@/lib/auth/identity";
import { revokeInvitesOf } from "@/lib/invites";

// SALLE-07 : l'hôte expulse un participant ou un spectateur ; la personne ne
// peut plus rejoindre cette salle et ses liens d'invitation sont révoqués.

export async function isBanned(lobbyId: string, identity: Identity): Promise<boolean> {
  const row = await db.query.lobbyBans.findFirst({
    columns: { id: true },
    where: and(
      eq(lobbyBans.lobby_id, lobbyId),
      identity.kind === "user"
        ? eq(lobbyBans.user_id, identity.userId)
        : eq(lobbyBans.guest_id, identity.guestId),
    ),
  });
  return row !== undefined;
}

export type KickResult =
  { ok: true } | { ok: false; reason: "not_found" | "is_bot" | "is_host" | "bad_state" };

export async function kickPlayer(
  lobby: { id: string; status: string; host_user_id: string | null; host_guest_id: string | null },
  playerId: string,
): Promise<KickResult> {
  // Pendant le décompte et la course, la liste des participants est figée.
  if (lobby.status !== "lobby" && lobby.status !== "finished")
    return { ok: false, reason: "bad_state" };

  const player = await db.query.lobbyPlayers.findFirst({
    columns: { id: true, user_id: true, guest_id: true, is_bot: true },
    where: and(eq(lobbyPlayers.id, playerId), eq(lobbyPlayers.lobby_id, lobby.id)),
  });
  if (!player) return { ok: false, reason: "not_found" };
  if (player.is_bot) return { ok: false, reason: "is_bot" };
  if (
    (player.user_id && player.user_id === lobby.host_user_id) ||
    (player.guest_id && player.guest_id === lobby.host_guest_id)
  ) {
    return { ok: false, reason: "is_host" };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(lobbyBans)
      .values({ lobby_id: lobby.id, user_id: player.user_id, guest_id: player.guest_id })
      .onConflictDoNothing();
    await tx.delete(lobbyPlayers).where(eq(lobbyPlayers.id, player.id));
  });
  await revokeInvitesOf(lobby.id, { userId: player.user_id, guestId: player.guest_id });
  return { ok: true };
}
