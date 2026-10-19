import "server-only";
import { kysely as db } from "@/lib/db";
import { readSession } from "./session";
import { readGuest } from "./guest";

export type Identity =
  | { kind: "user"; userId: string; username: string; displayName: string }
  | { kind: "guest"; guestId: string; displayName: string };

/**
 * Qui agit sur cette requête: un compte connecté, un invité ayant choisi un
 * pseudonyme (AUTH-02), ou personne (null — l'appelant répond 401).
 * Ne crée jamais rien : un invité doit passer par POST /api/auth/guest.
 */
export async function getIdentity(): Promise<Identity | null> {
  const session = await readSession();
  if (session) {
    const user = await db
      .selectFrom("users")
      .select(["id", "username", "display_name"])
      .where("id", "=", session.userId)
      .executeTakeFirst();
    if (user) {
      return {
        kind: "user",
        userId: user.id,
        username: user.username,
        displayName: user.display_name,
      };
    }
  }

  const guest = await readGuest();
  if (!guest) return null;
  return { kind: "guest", guestId: guest.guestId, displayName: guest.name };
}

/** Alias conservé pour les pages serveur en lecture seule. */
export const peekIdentity = getIdentity;
