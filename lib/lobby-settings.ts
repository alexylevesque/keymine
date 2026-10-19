import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbies, lobbyPlayers } from "@/db/schema";
import type { LobbyUpdate } from "@/lib/lobby-schema";

// CONF-12 : application des modifications de réglages faites par l'hôte.
// Séparé de la route pour être testé directement contre PostgreSQL.

export type ApplySettingsResult =
  | { ok: true }
  | { ok: false; reason: "not_waiting" | "capacity_too_low" | "include_exclude_conflict" };

type LobbyRow = {
  id: string;
  status: string;
  include_chars: string[];
  exclude_chars: string[];
  accent_wanted: string[];
  accent_forbidden: string[];
};

export async function applyLobbySettings(
  lobby: LobbyRow,
  s: LobbyUpdate,
): Promise<ApplySettingsResult> {
  if (lobby.status !== "lobby") return { ok: false, reason: "not_waiting" };

  // Réduire la capacité sous le nombre de participants actuel n'a pas de sens.
  if (s.maxPlayers !== undefined) {
    const count = await db.$count(
      lobbyPlayers,
      and(
        eq(lobbyPlayers.lobby_id, lobby.id),
        eq(lobbyPlayers.role, "participant"),
        eq(lobbyPlayers.active, true),
      ),
    );
    if (s.maxPlayers < count) return { ok: false, reason: "capacity_too_low" };
  }

  // Un caractère ne peut pas être à la fois inclus et exclu (CONF-07), y compris
  // quand seule l'une des deux listes est modifiée.
  const include = s.includeChars ?? lobby.include_chars;
  const exclude = s.excludeChars ?? lobby.exclude_chars;
  const accentWanted = s.accentWanted ?? lobby.accent_wanted;
  const accentForbidden = s.accentForbidden ?? lobby.accent_forbidden;
  if (
    include.some((c) => exclude.includes(c)) ||
    accentWanted.some((a) => accentForbidden.includes(a))
  )
    return { ok: false, reason: "include_exclude_conflict" };

  const updated = await db
    .update(lobbies)
    .set({
      ...(s.name !== undefined && { name: s.name }),
      ...(s.access !== undefined && { access: s.access }),
      ...(s.maxPlayers !== undefined && { max_players: s.maxPlayers }),
      ...(s.durationSeconds !== undefined && { duration_seconds: s.durationSeconds }),
      ...(s.language !== undefined && { language: s.language }),
      ...(s.textType !== undefined && { text_type: s.textType }),
      ...(s.textLength !== undefined && { text_length: s.textLength }),
      ...(s.complexity !== undefined && { complexity: s.complexity }),
      ...(s.uppercase !== undefined && { allow_uppercase: s.uppercase }),
      ...(s.punctuation !== undefined && { allow_punctuation: s.punctuation }),
      ...(s.digits !== undefined && { allow_digits: s.digits }),
      ...(s.accents !== undefined && { allow_accents: s.accents }),
      ...(s.includeChars !== undefined && { include_chars: s.includeChars }),
      ...(s.excludeChars !== undefined && { exclude_chars: s.excludeChars }),
      ...(s.errorMode !== undefined && { error_mode: s.errorMode }),
      ...(s.penaltySeconds !== undefined && { penalty_seconds: s.penaltySeconds }),
      ...(s.accentWanted !== undefined && { accent_wanted: s.accentWanted }),
      ...(s.accentForbidden !== undefined && { accent_forbidden: s.accentForbidden }),
      ...(s.comebackBonus !== undefined && { comeback_bonus: s.comebackBonus }),
      ...(s.bonusKinds !== undefined && { bonus_kinds: s.bonusKinds }),
    })
    .where(and(eq(lobbies.id, lobby.id), eq(lobbies.status, "lobby")));
  // La salle a quitté l'attente entre la lecture et l'écriture (démarrage concurrent).
  if ((updated.rowCount ?? 0) === 0) return { ok: false, reason: "not_waiting" };
  return { ok: true };
}
