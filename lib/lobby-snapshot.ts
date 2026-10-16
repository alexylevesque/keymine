import { db } from "@/lib/db";
import type { BotLevel } from "@/db/types";
import { botDisplayName } from "@/lib/race/bots";
import { championsCached } from "@/lib/leaderboard";

// État d'une salle tel que diffusé aux clients (SALLE-01, SALLE-02, CONF-12).
// Partagé entre la route HTTP GET /api/lobbies/[code] et le serveur temps réel,
// donc sans dépendance à Next.js.

export type RawPlayer = {
  id: string;
  userId: string | null;
  guestId: string | null;
  name: string;
  role: "participant" | "spectator";
  isBot: boolean;
  botLevel: BotLevel | null;
  /** Photo du compte (téléversée ou fournie par Discord/GitHub), sinon null : avatar généré. */
  avatarUrl: string | null;
  joinedAt: Date;
  /** Classe du champion de la semaine passée (couronne), sinon null. */
  champion: number | null;
};

export type RawLobbySnapshot = {
  lobby: {
    id: string;
    code: string;
    name: string;
    access: string;
    language: string;
    maxPlayers: number;
    durationSeconds: number;
    textType: string;
    textLength: number;
    complexity: string;
    uppercase: boolean;
    punctuation: boolean;
    digits: boolean;
    accents: boolean;
    includeChars: string[];
    excludeChars: string[];
    errorMode: string;
    penaltySeconds: number;
    comebackBonus: boolean;
    bonusKinds: string[];
    accentWanted: string[];
    accentForbidden: string[];
    status: string;
    hostUserId: string | null;
    hostGuestId: string | null;
  };
  players: RawPlayer[];
  activeRace: { id: string; status: string; startsAt: Date } | null;
};

export type Viewer = { userId: string | null; guestId: string | null };

export type PlayerView = {
  id: string;
  name: string;
  role: "participant" | "spectator";
  isBot: boolean;
  botLevel: BotLevel | null;
  avatarUrl: string | null;
  champion: number | null;
  isSelf: boolean;
  isHost: boolean;
  connected: boolean;
};

export type LobbyView = {
  lobby: Omit<RawLobbySnapshot["lobby"], "id" | "hostUserId" | "hostGuestId"> & { isHost: boolean };
  players: PlayerView[];
  activeRace: { id: string; status: string; startsAt: string } | null;
};

export async function loadLobbySnapshot(code: string): Promise<RawLobbySnapshot | null> {
  const lobby = await db
    .selectFrom("lobbies")
    .selectAll()
    .where("code", "=", code.toUpperCase())
    .executeTakeFirst();
  if (!lobby) return null;

  const players = await db
    .selectFrom("lobby_players")
    .leftJoin("users", "users.id", "lobby_players.user_id")
    .select([
      "lobby_players.id",
      "lobby_players.user_id",
      "lobby_players.guest_id",
      "lobby_players.guest_name",
      "lobby_players.role",
      "lobby_players.is_bot",
      "lobby_players.bot_level",
      "lobby_players.joined_at",
      "users.display_name",
      "users.avatar_url",
    ])
    .where("lobby_players.lobby_id", "=", lobby.id)
    .where("lobby_players.active", "=", true)
    .orderBy("lobby_players.joined_at", "asc")
    .execute();

  const champions = await championsCached();
  const activeRace = await db
    .selectFrom("races")
    .select(["id", "status", "starts_at"])
    .where("lobby_id", "=", lobby.id)
    .where("status", "in", ["countdown", "racing"])
    .orderBy("created_at", "desc")
    .executeTakeFirst();

  return {
    lobby: {
      id: lobby.id,
      code: lobby.code,
      name: lobby.name,
      access: lobby.access,
      language: lobby.language,
      maxPlayers: lobby.max_players,
      durationSeconds: lobby.duration_seconds,
      textType: lobby.text_type,
      textLength: lobby.text_length,
      complexity: lobby.complexity,
      uppercase: lobby.allow_uppercase,
      punctuation: lobby.allow_punctuation,
      digits: lobby.allow_digits,
      accents: lobby.allow_accents,
      includeChars: lobby.include_chars,
      excludeChars: lobby.exclude_chars,
      errorMode: lobby.error_mode,
      penaltySeconds: lobby.penalty_seconds,
      comebackBonus: lobby.comeback_bonus,
      bonusKinds: lobby.bonus_kinds,
      accentWanted: lobby.accent_wanted,
      accentForbidden: lobby.accent_forbidden,
      status: lobby.status,
      hostUserId: lobby.host_user_id,
      hostGuestId: lobby.host_guest_id,
    },
    players: players.map((p) => ({
      id: p.id,
      userId: p.user_id,
      guestId: p.guest_id,
      name:
        p.is_bot && p.bot_level
          ? botDisplayName(p.bot_level)
          : (p.display_name ?? p.guest_name ?? "Joueur"),
      role: p.role,
      isBot: p.is_bot,
      botLevel: p.bot_level,
      avatarUrl: p.is_bot ? null : (p.avatar_url ?? null),
      joinedAt: new Date(p.joined_at),
      champion: p.user_id ? (champions.get(p.user_id) ?? null) : null,
    })),
    activeRace: activeRace
      ? { id: activeRace.id, status: activeRace.status, startsAt: new Date(activeRace.starts_at) }
      : null,
  };
}

function isSameViewer(p: { userId: string | null; guestId: string | null }, v: Viewer | null) {
  if (!v) return false;
  if (v.userId && p.userId === v.userId) return true;
  return !!v.guestId && p.guestId === v.guestId;
}

/**
 * Vue adaptée à une personne : qui est l'hôte, qui est « moi », et qui est
 * actuellement connecté (ensemble de clés `u:<id>` ou `g:<id>` fourni par le
 * serveur temps réel ; absent pour la route HTTP).
 */
export function viewLobby(
  raw: RawLobbySnapshot,
  viewer: Viewer | null,
  connectedKeys?: ReadonlySet<string>,
): LobbyView {
  const { id: _id, hostUserId, hostGuestId, ...publicLobby } = raw.lobby;
  void _id;
  const host = { userId: hostUserId, guestId: hostGuestId };
  return {
    lobby: { ...publicLobby, isHost: isSameViewer(host, viewer) },
    players: raw.players.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      isBot: p.isBot,
      botLevel: p.botLevel,
      avatarUrl: p.avatarUrl,
      champion: p.champion,
      isSelf: isSameViewer(p, viewer),
      isHost: isSameViewer(p, host),
      connected: p.isBot
        ? true
        : connectedKeys
          ? connectedKeys.has(p.userId ? `u:${p.userId}` : `g:${p.guestId}`)
          : true,
    })),
    activeRace: raw.activeRace
      ? {
          id: raw.activeRace.id,
          status: raw.activeRace.status,
          startsAt: raw.activeRace.startsAt.toISOString(),
        }
      : null,
  };
}
