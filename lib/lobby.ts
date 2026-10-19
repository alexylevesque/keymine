import { customAlphabet } from "nanoid";
import { lobbyCodeSchema } from "@/lib/api-input";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, isUniqueViolation } from "@/lib/db";
import { lobbies, lobbyPlayers } from "@/db/schema";
import type { Identity } from "@/lib/auth/identity";
import { isBanned } from "@/lib/bans";

// Alphabet sans caractères ambigus (0/O, 1/I/l) pour un code "à la Kahoot"
// facile à lire et à retaper (COUR-2).
const nanoLobbyCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);

export async function generateUniqueLobbyCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = nanoLobbyCode();
    const existing = await db.query.lobbies.findFirst({
      columns: { id: true },
      where: and(eq(lobbies.code, code), inArray(lobbies.status, ["lobby", "countdown", "racing"])),
    });
    if (!existing) return code;
  }
  throw new Error("Impossible de générer un code de salle unique");
}

export function isHost(
  identity: Identity,
  lobby: { host_user_id: string | null; host_guest_id: string | null },
): boolean {
  if (identity.kind === "user") return lobby.host_user_id === identity.userId;
  return lobby.host_guest_id === identity.guestId;
}

/** Cherche une salle par son code ; un code mal formé est refusé par Zod avant la base (TECH-07). */
export async function getLobbyByCode(code: string) {
  const parsed = lobbyCodeSchema.safeParse(code);
  if (!parsed.success) return undefined;
  return db.query.lobbies.findFirst({ where: eq(lobbies.code, parsed.data) });
}

type PlayerRole = "participant" | "spectator";

/** Condition « cette ligne de lobby_players est cette personne » (compte ou invité). */
export function isPlayer(identity: Identity) {
  return identity.kind === "user"
    ? eq(lobbyPlayers.user_id, identity.userId)
    : eq(lobbyPlayers.guest_id, identity.guestId);
}

export type JoinResult =
  | { ok: true }
  | { ok: false; reason: "full" }
  | { ok: false; reason: "banned" }
  | { ok: false; reason: "already_in_room"; currentCode: string };

/** Salle active (non fermée) où cette personne se trouve déjà, s'il y en a une (SALLE-06). */
export async function findActiveRoom(identity: Identity) {
  const [room] = await db
    .select({ id: lobbies.id, code: lobbies.code })
    .from(lobbyPlayers)
    .innerJoin(lobbies, eq(lobbies.id, lobbyPlayers.lobby_id))
    .where(
      and(
        eq(lobbyPlayers.active, true),
        ne(lobbies.status, "closed"), // une salle fermée ne retient plus personne
        isPlayer(identity),
      ),
    )
    .limit(1);
  return room;
}

async function participantCount(lobbyId: string): Promise<number> {
  return db.$count(
    lobbyPlayers,
    and(
      eq(lobbyPlayers.lobby_id, lobbyId),
      eq(lobbyPlayers.role, "participant"),
      eq(lobbyPlayers.active, true),
    ),
  );
}

/**
 * Ajoute la personne à la salle (ou met à jour son rôle). Refuse si elle est
 * déjà dans une autre salle (SALLE-06, aussi garanti par un index unique) ou
 * si la salle est pleine (spectateurs exclus de la capacité, SALLE-05).
 * Sans `role`, un membre existant garde le sien et un nouveau est participant.
 * Une personne libérée de cette salle (absence) y est réactivée.
 */
export async function joinLobby(
  lobby: { id: string; max_players: number },
  identity: Identity,
  role?: PlayerRole,
): Promise<JoinResult> {
  // SALLE-07 : une personne expulsée ne peut plus rejoindre cette salle.
  if (await isBanned(lobby.id, identity)) return { ok: false, reason: "banned" };

  const existing = await db.query.lobbyPlayers.findFirst({
    columns: { id: true, active: true, role: true },
    where: and(eq(lobbyPlayers.lobby_id, lobby.id), isPlayer(identity)),
  });

  const wanted: PlayerRole = role ?? existing?.role ?? "participant";
  const needsSeat =
    wanted === "participant" && !(existing?.active && existing.role === "participant");
  const full = needsSeat && (await participantCount(lobby.id)) >= lobby.max_players;

  if (existing?.active) {
    if (full) return { ok: false, reason: "full" };
    await db
      .update(lobbyPlayers)
      .set({ role: wanted, last_seen_at: new Date() })
      .where(eq(lobbyPlayers.id, existing.id));
    return { ok: true };
  }

  const other = await findActiveRoom(identity);
  if (other) return { ok: false, reason: "already_in_room", currentCode: other.code };
  if (full) return { ok: false, reason: "full" };

  try {
    if (existing) {
      await db
        .update(lobbyPlayers)
        .set({ active: true, role: wanted, last_seen_at: new Date(), joined_at: new Date() })
        .where(eq(lobbyPlayers.id, existing.id));
    } else {
      await db.insert(lobbyPlayers).values({
        lobby_id: lobby.id,
        user_id: identity.kind === "user" ? identity.userId : null,
        guest_id: identity.kind === "guest" ? identity.guestId : null,
        guest_name: identity.kind === "guest" ? identity.displayName : null,
        role: wanted,
      });
    }
  } catch (error) {
    // Course entre deux onglets: l'index unique de SALLE-06 a refusé le doublon.
    if (isUniqueViolation(error)) {
      const concurrent = await findActiveRoom(identity);
      if (concurrent && concurrent.id === lobby.id) return { ok: true };
      if (concurrent) return { ok: false, reason: "already_in_room", currentCode: concurrent.code };
    }
    throw error;
  }
  return { ok: true };
}
