import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbies, lobbyInvites } from "@/db/schema";
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
  const count = await db.$count(
    lobbyInvites,
    and(eq(lobbyInvites.lobby_id, lobbyId), isNull(lobbyInvites.revoked_at)),
  );
  if (count >= MAX_INVITES_PER_LOBBY) return null;
  const [invite] = await db
    .insert(lobbyInvites)
    .values({ lobby_id: lobbyId, token: generateInviteToken(), label: label?.trim() || null })
    .returning({ id: lobbyInvites.id, token: lobbyInvites.token });
  if (!invite) throw new Error("invitation : aucune ligne créée");
  return invite;
}

// Un lien révoqué disparaît de la liste (et ne compte plus dans la limite) pour que l'hôte
// puisse réinviter la personne ; la ligne reste en base pour que le lien soit refusé (« révoqué »).
export async function listInvites(lobbyId: string): Promise<InviteView[]> {
  const rows = await db.query.lobbyInvites.findMany({
    where: and(eq(lobbyInvites.lobby_id, lobbyId), isNull(lobbyInvites.revoked_at)),
    orderBy: asc(lobbyInvites.created_at),
  });
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
    .update(lobbyInvites)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(lobbyInvites.id, inviteId),
        eq(lobbyInvites.lobby_id, lobbyId),
        isNull(lobbyInvites.revoked_at),
      ),
    );
  return (res.rowCount ?? 0) > 0;
}

/** Révoque tous les liens utilisés par cette personne (expulsion, SALLE-07). */
export async function revokeInvitesOf(
  lobbyId: string,
  who: { userId?: string | null; guestId?: string | null },
) {
  await db
    .update(lobbyInvites)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(lobbyInvites.lobby_id, lobbyId),
        isNull(lobbyInvites.revoked_at),
        who.userId
          ? eq(lobbyInvites.claimed_user_id, who.userId)
          : eq(lobbyInvites.claimed_guest_id, who.guestId ?? ""),
      ),
    );
}

/** Fermeture de la salle : tous les liens deviennent invalides. */
export async function revokeAllInvites(lobbyId: string) {
  await db
    .update(lobbyInvites)
    .set({ revoked_at: new Date() })
    .where(and(eq(lobbyInvites.lobby_id, lobbyId), isNull(lobbyInvites.revoked_at)));
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
  const [invite] = await db
    .select({
      id: lobbyInvites.id,
      revoked_at: lobbyInvites.revoked_at,
      claimed_ip: lobbyInvites.claimed_ip,
      lobby_id: lobbies.id,
      lobby_code: lobbies.code,
      lobby_status: lobbies.status,
    })
    .from(lobbyInvites)
    .innerJoin(lobbies, eq(lobbies.id, lobbyInvites.lobby_id))
    .where(eq(lobbyInvites.token, token))
    .limit(1);

  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.lobby_status === "closed") return { ok: false, reason: "closed" };
  if (invite.revoked_at) return { ok: false, reason: "revoked" };

  const ok = { ok: true as const, lobbyCode: invite.lobby_code, lobbyId: invite.lobby_id };

  if (!invite.claimed_ip) {
    const claimed = await db
      .update(lobbyInvites)
      .set({
        claimed_at: new Date(),
        claimed_ip: ip,
        claimed_user_id: identity.kind === "user" ? identity.userId : null,
        claimed_guest_id: identity.kind === "guest" ? identity.guestId : null,
        claimed_name: identity.displayName,
      })
      .where(and(eq(lobbyInvites.id, invite.id), isNull(lobbyInvites.claimed_ip)));
    if ((claimed.rowCount ?? 0) > 0) return ok;
    // Quelqu'un l'a pris entre-temps : on retombe sur la vérification d'IP.
    const fresh = await db.query.lobbyInvites.findFirst({
      columns: { claimed_ip: true },
      where: eq(lobbyInvites.id, invite.id),
    });
    return fresh?.claimed_ip === ip ? ok : { ok: false, reason: "wrong_ip" };
  }

  return invite.claimed_ip === ip ? ok : { ok: false, reason: "wrong_ip" };
}
