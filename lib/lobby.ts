import { customAlphabet } from "nanoid";
import { lobbyCodeSchema } from "@/lib/api-input";
import { db } from "@/lib/db";
import type { Identity } from "@/lib/auth/identity";
import { isBanned } from "@/lib/bans";

// Alphabet sans caractères ambigus (0/O, 1/I/l) pour un code "à la Kahoot"
// facile à lire et à retaper (COUR-2).
const nanoLobbyCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);

export async function generateUniqueLobbyCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = nanoLobbyCode();
    const existing = await db
      .selectFrom("lobbies")
      .select("id")
      .where("code", "=", code)
      .where("status", "in", ["lobby", "countdown", "racing"])
      .executeTakeFirst();
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
  return db.selectFrom("lobbies").selectAll().where("code", "=", parsed.data).executeTakeFirst();
}

type PlayerRole = "participant" | "spectator";

export type JoinResult =
  | { ok: true }
  | { ok: false; reason: "full" }
  | { ok: false; reason: "banned" }
  | { ok: false; reason: "already_in_room"; currentCode: string };

/** Salle active (non fermée) où cette personne se trouve déjà, s'il y en a une (SALLE-06). */
export async function findActiveRoom(identity: Identity) {
  return db
    .selectFrom("lobby_players")
    .innerJoin("lobbies", "lobbies.id", "lobby_players.lobby_id")
    .select(["lobbies.id", "lobbies.code"])
    .where("lobby_players.active", "=", true)
    .where("lobbies.status", "<>", "closed") // une salle fermée ne retient plus personne
    .where((eb) =>
      identity.kind === "user"
        ? eb("lobby_players.user_id", "=", identity.userId)
        : eb("lobby_players.guest_id", "=", identity.guestId),
    )
    .executeTakeFirst();
}

async function participantCount(lobbyId: string): Promise<number> {
  const count = await db
    .selectFrom("lobby_players")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .where("lobby_id", "=", lobbyId)
    .where("role", "=", "participant")
    .where("active", "=", true)
    .executeTakeFirst();
  return Number(count?.n ?? 0);
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

  const existing = await db
    .selectFrom("lobby_players")
    .select(["id", "active", "role"])
    .where("lobby_id", "=", lobby.id)
    .where((eb) =>
      identity.kind === "user"
        ? eb("user_id", "=", identity.userId)
        : eb("guest_id", "=", identity.guestId),
    )
    .executeTakeFirst();

  const wanted: PlayerRole = role ?? existing?.role ?? "participant";
  const needsSeat = wanted === "participant" && !(existing?.active && existing.role === "participant");
  const full = needsSeat && (await participantCount(lobby.id)) >= lobby.max_players;

  if (existing?.active) {
    if (full) return { ok: false, reason: "full" };
    await db
      .updateTable("lobby_players")
      .set({ role: wanted, last_seen_at: new Date() })
      .where("id", "=", existing.id)
      .execute();
    return { ok: true };
  }

  const other = await findActiveRoom(identity);
  if (other) return { ok: false, reason: "already_in_room", currentCode: other.code };
  if (full) return { ok: false, reason: "full" };

  try {
    if (existing) {
      await db
        .updateTable("lobby_players")
        .set({ active: true, role: wanted, last_seen_at: new Date(), joined_at: new Date() })
        .where("id", "=", existing.id)
        .execute();
    } else {
      await db
        .insertInto("lobby_players")
        .values({
          lobby_id: lobby.id,
          user_id: identity.kind === "user" ? identity.userId : null,
          guest_id: identity.kind === "guest" ? identity.guestId : null,
          guest_name: identity.kind === "guest" ? identity.displayName : null,
          role: wanted,
        })
        .execute();
    }
  } catch (error) {
    // Course entre deux onglets: l'index unique de SALLE-06 a refusé le doublon.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      const concurrent = await findActiveRoom(identity);
      if (concurrent && concurrent.id === lobby.id) return { ok: true };
      if (concurrent) return { ok: false, reason: "already_in_room", currentCode: concurrent.code };
    }
    throw error;
  }
  return { ok: true };
}
