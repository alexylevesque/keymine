import { kysely as db } from "@/lib/db";
import type { Identity } from "@/lib/auth/identity";
import { revokeInvitesOf } from "@/lib/invites";

// SALLE-07 : l'hôte expulse un participant ou un spectateur ; la personne ne
// peut plus rejoindre cette salle et ses liens d'invitation sont révoqués.

export async function isBanned(lobbyId: string, identity: Identity): Promise<boolean> {
  const row = await db
    .selectFrom("lobby_bans")
    .select("id")
    .where("lobby_id", "=", lobbyId)
    .where((eb) =>
      identity.kind === "user" ? eb("user_id", "=", identity.userId) : eb("guest_id", "=", identity.guestId),
    )
    .executeTakeFirst();
  return row !== undefined;
}

export type KickResult = { ok: true } | { ok: false; reason: "not_found" | "is_bot" | "is_host" | "bad_state" };

export async function kickPlayer(
  lobby: { id: string; status: string; host_user_id: string | null; host_guest_id: string | null },
  playerId: string,
): Promise<KickResult> {
  // Pendant le décompte et la course, la liste des participants est figée.
  if (lobby.status !== "lobby" && lobby.status !== "finished") return { ok: false, reason: "bad_state" };

  const player = await db
    .selectFrom("lobby_players")
    .select(["id", "user_id", "guest_id", "is_bot"])
    .where("id", "=", playerId)
    .where("lobby_id", "=", lobby.id)
    .executeTakeFirst();
  if (!player) return { ok: false, reason: "not_found" };
  if (player.is_bot) return { ok: false, reason: "is_bot" };
  if (
    (player.user_id && player.user_id === lobby.host_user_id) ||
    (player.guest_id && player.guest_id === lobby.host_guest_id)
  ) {
    return { ok: false, reason: "is_host" };
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("lobby_bans")
      .values({ lobby_id: lobby.id, user_id: player.user_id, guest_id: player.guest_id })
      .onConflict((oc) => oc.doNothing())
      .execute();
    await trx.deleteFrom("lobby_players").where("id", "=", player.id).execute();
  });
  await revokeInvitesOf(lobby.id, { userId: player.user_id, guestId: player.guest_id });
  return { ok: true };
}
