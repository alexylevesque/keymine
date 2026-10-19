import { and, asc, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbies, lobbyPlayers } from "@/db/schema";
import type { LobbyStatus } from "@/db/types";

// Présence en salle d'attente et sur l'écran des résultats (SALLE-08) : l'hôte est considéré parti s'il
// n'a donné aucun signe de vie (WebSocket ou battement HTTP) depuis
// HOST_ABSENCE_MS. Le rôle passe alors à la personne humaine connectée
// (compte) présente depuis le plus longtemps ; s'il n'en reste aucune, la
// salle est fermée. Fonction sans dépendance à Next.js : appelée par le
// serveur temps réel et par la route HTTP de repli.
export const HOST_ABSENCE_MS = 30_000;
export const PLAYER_ABSENCE_MS = 60_000;

export type SweepResult = { transferred: number; closed: number; released: number };

export async function sweepLobbies(now: Date = new Date()): Promise<SweepResult> {
  const hostCutoff = new Date(now.getTime() - HOST_ABSENCE_MS);
  const playerCutoff = new Date(now.getTime() - PLAYER_ABSENCE_MS);
  const result: SweepResult = { transferred: 0, closed: 0, released: 0 };

  // Joueurs disparus d'une salle en attente : on libère leur place.
  const released = await db
    .update(lobbyPlayers)
    .set({ active: false })
    .where(
      and(
        eq(lobbyPlayers.active, true),
        eq(lobbyPlayers.is_bot, false),
        lt(lobbyPlayers.last_seen_at, playerCutoff),
        inArray(
          lobbyPlayers.lobby_id,
          db.select({ id: lobbies.id }).from(lobbies).where(eq(lobbies.status, "lobby")),
        ),
      ),
    );
  result.released = released.rowCount ?? 0;

  // Hôte absent : en salle d'attente et sur l'écran des résultats (statut « finished »), où l'on
  // peut encore REJOUER ou FERMER LA SALLE. Pendant une course, voir `handOverHostDuringRace`.
  const stale = await db
    .select({ id: lobbies.id, host_user_id: lobbies.host_user_id, status: lobbies.status })
    .from(lobbies)
    .where(
      and(
        inArray(lobbies.status, ["lobby", "finished"]),
        lt(lobbies.last_host_seen_at, hostCutoff),
      ),
    );

  for (const lobby of stale) {
    const outcome = await handOverHost(lobby.id, lobby.host_user_id, {
      now,
      presentSince: hostCutoff,
      closeIfNobody: true,
      fromStatuses: ["lobby", "finished"],
    });
    if (outcome === "transferred") result.transferred++;
    if (outcome === "closed") result.closed++;
  }
  return result;
}

type HandOverOptions = {
  now: Date;
  /** Seuls les membres vus depuis cette date peuvent devenir hôtes (null : tous les membres actifs). */
  presentSince: Date | null;
  /** Fermer la salle s'il n'y a personne pour reprendre le rôle. */
  closeIfNobody: boolean;
  /** Statuts de salle concernés (garde-fou contre une course qui change d'état entre-temps). */
  fromStatuses: LobbyStatus[];
};

/**
 * Passe le rôle d'hôte au compte connecté (participant ou spectateur) présent dans la salle depuis le
 * plus longtemps (SALLE-08). Les invités ne peuvent pas être hôtes (AUTH-03 : ils ne créent pas de salle).
 */
export async function handOverHost(
  lobbyId: string,
  currentHostUserId: string | null,
  { now, presentSince, closeIfNobody, fromStatuses }: HandOverOptions,
): Promise<"transferred" | "closed" | "kept"> {
  const next = await db.query.lobbyPlayers.findFirst({
    columns: { user_id: true },
    where: and(
      eq(lobbyPlayers.lobby_id, lobbyId),
      eq(lobbyPlayers.is_bot, false),
      eq(lobbyPlayers.active, true),
      isNotNull(lobbyPlayers.user_id),
      currentHostUserId ? ne(lobbyPlayers.user_id, currentHostUserId) : undefined,
      presentSince ? gte(lobbyPlayers.last_seen_at, presentSince) : undefined,
    ),
    orderBy: asc(lobbyPlayers.joined_at),
  });

  if (next?.user_id) {
    const res = await db
      .update(lobbies)
      .set({ host_user_id: next.user_id, host_guest_id: null, last_host_seen_at: now })
      .where(and(eq(lobbies.id, lobbyId), inArray(lobbies.status, fromStatuses)));
    return (res.rowCount ?? 0) > 0 ? "transferred" : "kept";
  }
  if (!closeIfNobody) return "kept";
  const res = await db
    .update(lobbies)
    .set({ status: "closed", closed_at: now })
    .where(and(eq(lobbies.id, lobbyId), inArray(lobbies.status, fromStatuses)));
  return (res.rowCount ?? 0) > 0 ? "closed" : "kept";
}

/**
 * L'hôte quitte une course en cours (abandon ou déconnexion prolongée) : le rôle passe tout de suite
 * au plus ancien compte encore dans la salle, pour que quelqu'un puisse REJOUER ou fermer la salle à
 * la fin. On ne ferme pas une course en cours : s'il ne reste que des invités, la course se termine
 * normalement et la salle est fermée par le balayage si personne ne reprend le rôle.
 */
export async function handOverHostDuringRace(
  lobbyId: string,
  leavingUserId: string,
  now: Date = new Date(),
): Promise<"transferred" | "kept"> {
  const lobby = await db.query.lobbies.findFirst({
    columns: { host_user_id: true, status: true },
    where: eq(lobbies.id, lobbyId),
  });
  if (!lobby || lobby.host_user_id !== leavingUserId) return "kept";
  if (lobby.status !== "countdown" && lobby.status !== "racing") return "kept";
  const outcome = await handOverHost(lobbyId, leavingUserId, {
    now,
    presentSince: null,
    closeIfNobody: false,
    fromStatuses: ["countdown", "racing"],
  });
  return outcome === "transferred" ? "transferred" : "kept";
}
