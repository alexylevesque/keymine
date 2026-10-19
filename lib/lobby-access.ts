import { kysely as db } from "@/lib/db";
import type { Identity } from "@/lib/auth/identity";
import { isHost } from "@/lib/lobby";

// SALLE-03 : le code seul suffit pour une salle publique ou « sur code » ;
// une salle privée n'est accessible que par lien d'invitation (l'hôte et les
// personnes déjà présentes — rechargement de page, second onglet — restent admis).
export async function needsInvite(
  lobby: { id: string; access: string; host_user_id: string | null; host_guest_id: string | null },
  identity: Identity,
): Promise<boolean> {
  if (lobby.access !== "private") return false;
  if (isHost(identity, lobby)) return false;
  const member = await db
    .selectFrom("lobby_players")
    .select("id")
    .where("lobby_id", "=", lobby.id)
    .where("active", "=", true)
    .where((eb) =>
      identity.kind === "user" ? eb("user_id", "=", identity.userId) : eb("guest_id", "=", identity.guestId),
    )
    .executeTakeFirst();
  return member === undefined;
}
