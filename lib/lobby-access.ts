import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbyPlayers } from "@/db/schema";
import type { Identity } from "@/lib/auth/identity";
import { isHost, isPlayer } from "@/lib/lobby";

// SALLE-03 : le code seul suffit pour une salle publique ou « sur code » ;
// une salle privée n'est accessible que par lien d'invitation (l'hôte et les
// personnes déjà présentes — rechargement de page, second onglet — restent admis).
export async function needsInvite(
  lobby: { id: string; access: string; host_user_id: string | null; host_guest_id: string | null },
  identity: Identity,
): Promise<boolean> {
  if (lobby.access !== "private") return false;
  if (isHost(identity, lobby)) return false;
  const member = await db.query.lobbyPlayers.findFirst({
    columns: { id: true },
    where: and(
      eq(lobbyPlayers.lobby_id, lobby.id),
      eq(lobbyPlayers.active, true),
      isPlayer(identity),
    ),
  });
  return member === undefined;
}
