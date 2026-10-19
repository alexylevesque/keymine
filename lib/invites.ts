import { kysely as db } from "@/lib/db";
import type { Identity } from "@/lib/auth/identity";
import { generateInviteToken } from "@/lib/invite-token";

// SALLE-04 : liens d'invitation. Un jeton de 32 octets aléatoires (256 bits),
// distinct par invité, à usage unique : la première utilisation l'associe à une
// personne et à son adresse IP ; seule cette adresse peut ensuite le réutiliser
// (reconnexion). Expulsion et fermeture de la salle révoquent les liens.

export type InviteView = {
  id: string;
  token: string;
  label: string | null;
  status: "unused" | "used";
  usedBy: string | null;
  createdAt: Date;
};

export const MAX_INVITES_PER_LOBBY = 60;

export async function createInvite(lobbyId: string, label?: string | null) {
  const count = await db
    .selectFrom("lobby_invites")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where("lobby_id", "=", lobbyId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  if (Number(count?.n ?? 0) >= MAX_INVITES_PER_LOBBY) return null;
  return db
    .insertInto("lobby_invites")
    .values({ lobby_id: lobbyId, token: generateInviteToken(), label: label?.trim() || null })
    .returning(["id", "token"])
    .executeTakeFirstOrThrow();
}

// Un lien révoqué disparaît de la liste (et ne compte plus dans la limite) pour que l'hôte
// puisse réinviter la personne ; la ligne reste en base pour que le lien soit refusé (« révoqué »).
export async function listInvites(lobbyId: string): Promise<InviteView[]> {
  const rows = await db
    .selectFrom("lobby_invites")
    .selectAll()
    .where("lobby_id", "=", lobbyId)
    .where("revoked_at", "is", null)
    .orderBy("created_at", "asc")
    .execute();
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    label: r.label,
    status: r.claimed_at ? "used" : "unused",
    usedBy: r.claimed_name,
    createdAt: new Date(r.created_at),
  }));
}

export async function revokeInvite(lobbyId: string, inviteId: string): Promise<boolean> {
  const res = await db
    .updateTable("lobby_invites")
    .set({ revoked_at: new Date() })
    .where("id", "=", inviteId)
    .where("lobby_id", "=", lobbyId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  return Number(res.numUpdatedRows) > 0;
}

/** Révoque tous les liens utilisés par cette personne (expulsion, SALLE-07). */
export async function revokeInvitesOf(
  lobbyId: string,
  who: { userId?: string | null; guestId?: string | null },
) {
  await db
    .updateTable("lobby_invites")
    .set({ revoked_at: new Date() })
    .where("lobby_id", "=", lobbyId)
    .where("revoked_at", "is", null)
    .where((eb) =>
      who.userId
        ? eb("claimed_user_id", "=", who.userId)
        : eb("claimed_guest_id", "=", who.guestId ?? ""),
    )
    .execute();
}

/** Fermeture de la salle : tous les liens deviennent invalides. */
export async function revokeAllInvites(lobbyId: string) {
  await db
    .updateTable("lobby_invites")
    .set({ revoked_at: new Date() })
    .where("lobby_id", "=", lobbyId)
    .where("revoked_at", "is", null)
    .execute();
}

export type RedeemResult =
  | { ok: true; lobbyCode: string; lobbyId: string }
  | { ok: false; reason: "invalid" | "revoked" | "closed" | "wrong_ip" };

/**
 * Utilise un lien : le premier usage l'associe à la personne et à son IP
 * (mise à jour atomique : un seul gagnant si deux personnes cliquent en même
 * temps) ; ensuite seule la même adresse IP est acceptée.
 */
export async function redeemInvite(
  token: string,
  identity: Identity,
  ip: string,
): Promise<RedeemResult> {
  const invite = await db
    .selectFrom("lobby_invites")
    .innerJoin("lobbies", "lobbies.id", "lobby_invites.lobby_id")
    .select([
      "lobby_invites.id as id",
      "lobby_invites.revoked_at as revoked_at",
      "lobby_invites.claimed_ip as claimed_ip",
      "lobbies.id as lobby_id",
      "lobbies.code as lobby_code",
      "lobbies.status as lobby_status",
    ])
    .where("lobby_invites.token", "=", token)
    .executeTakeFirst();

  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.lobby_status === "closed") return { ok: false, reason: "closed" };
  if (invite.revoked_at) return { ok: false, reason: "revoked" };

  const ok = { ok: true as const, lobbyCode: invite.lobby_code, lobbyId: invite.lobby_id };

  if (!invite.claimed_ip) {
    const claimed = await db
      .updateTable("lobby_invites")
      .set({
        claimed_at: new Date(),
        claimed_ip: ip,
        claimed_user_id: identity.kind === "user" ? identity.userId : null,
        claimed_guest_id: identity.kind === "guest" ? identity.guestId : null,
        claimed_name: identity.displayName,
      })
      .where("id", "=", invite.id)
      .where("claimed_ip", "is", null)
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) > 0) return ok;
    // Quelqu'un l'a pris entre-temps : on retombe sur la vérification d'IP.
    const fresh = await db
      .selectFrom("lobby_invites")
      .select("claimed_ip")
      .where("id", "=", invite.id)
      .executeTakeFirst();
    return fresh?.claimed_ip === ip ? ok : { ok: false, reason: "wrong_ip" };
  }

  return invite.claimed_ip === ip ? ok : { ok: false, reason: "wrong_ip" };
}
