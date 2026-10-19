import { db } from "@/lib/db";
import { lobbies, lobbyPlayers, type Lobby } from "@/db/schema";
import { generateUniqueLobbyCode } from "@/lib/lobby";
import type { LobbySettings } from "@/lib/lobby-schema";
import { toAccentTypes, toBonusKinds } from "@/lib/lobby-choices";

/** Crée une salle pour un compte avec ces réglages ; l'hôte y entre avec son rôle. Renvoie le code. */
export async function createLobby(
  userId: string,
  s: LobbySettings & { name: string },
): Promise<string> {
  const code = await generateUniqueLobbyCode();
  const [lobby] = await db
    .insert(lobbies)
    .values({
      code,
      host_user_id: userId,
      host_guest_id: null,
      access: s.access,
      name: s.name,
      language: s.language,
      max_players: s.maxPlayers,
      duration_seconds: s.durationSeconds,
      text_type: s.textType,
      text_length: s.textLength,
      complexity: s.complexity,
      error_mode: s.errorMode,
      penalty_seconds: s.penaltySeconds,
      allow_uppercase: s.uppercase,
      allow_punctuation: s.punctuation,
      allow_digits: s.digits,
      allow_accents: s.accents,
      include_chars: s.includeChars,
      exclude_chars: s.excludeChars,
      comeback_bonus: s.comebackBonus,
      bonus_kinds: s.bonusKinds,
      accent_wanted: s.accentWanted,
      accent_forbidden: s.accentForbidden,
    })
    .returning({ id: lobbies.id, code: lobbies.code });
  if (!lobby) throw new Error("création de salle : aucune ligne créée");

  await db.insert(lobbyPlayers).values({ lobby_id: lobby.id, user_id: userId, role: s.hostRole });
  return lobby.code;
}

/** Les réglages d'une salle existante, tels qu'on les redonnerait à `createLobby` (REJOUER depuis l'historique). */
export function settingsFromLobby(lobby: Lobby): LobbySettings & { name: string } {
  return {
    name: lobby.name,
    access: lobby.access,
    hostRole: "participant",
    maxPlayers: lobby.max_players,
    durationSeconds: lobby.duration_seconds,
    language: lobby.language,
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
    bonusKinds: toBonusKinds(lobby.bonus_kinds),
    accentWanted: toAccentTypes(lobby.accent_wanted),
    accentForbidden: toAccentTypes(lobby.accent_forbidden),
  };
}
