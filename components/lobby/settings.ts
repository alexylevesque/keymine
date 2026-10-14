import type { Difficulty, TextType } from "@/db/types";
import type { LobbyView } from "@/lib/lobby-snapshot";
import { toAccentTypes, toBonusKinds } from "@/lib/lobby-choices";
import { BONUS_KINDS, type BonusKind } from "@/lib/race/bonus";
import type { AccentType } from "@/lib/text/accents";
import { normalizeRoomName } from "@/lib/room-name";
import { DIGITS, LETTERS, SYMBOLS } from "./key-maps";

// État du formulaire de réglages (création d'une salle et modification en
// salle d'attente, CONF-12) et conversion vers/depuis l'API.
export type Access = "public" | "unlisted" | "private";
export type ErrorMode = "accumuler" | "bloquer";
export type TextOption = "Majuscules" | "Ponctuation" | "Nombres" | "Accents";

export type SettingsState = {
  /** Nom de la salle ; vide = l'API propose « Salle de {pseudo} » (création) ou garde l'ancien (modification). */
  name: string;
  access: Access;
  language: "fr" | "en";
  duration: number;
  lobbySize: number;
  errorMode: ErrorMode;
  penalty: boolean;
  textType: TextType;
  length: number;
  complexity: Difficulty;
  /** Lettres et symboles « souvent » (vert) et « jamais » (rouge) ; les touches grises ne sont dans aucune liste. */
  includeChars: string[];
  excludeChars: string[];
  accentWanted: AccentType[];
  accentForbidden: AccentType[];
  options: TextOption[];
  /** Interrupteur général des bonus de remontée. */
  comebackBonus: boolean;
  /** Bonus permis quand l'interrupteur est actif. */
  bonusKinds: BonusKind[];
};

export type ChoiceState = "neutral" | "wanted" | "forbidden";

export const DEFAULT_SETTINGS: SettingsState = {
  name: "",
  access: "public",
  language: "fr",
  duration: 300,
  lobbySize: 30,
  errorMode: "accumuler",
  penalty: true,
  textType: "coherent",
  length: 40,
  complexity: "easy",
  includeChars: [],
  excludeChars: [],
  accentWanted: [],
  accentForbidden: [],
  options: [],
  comebackBonus: true,
  bonusKinds: [...BONUS_KINDS],
};

/** Corps envoyé à POST /api/lobbies et PATCH /api/lobbies/[code]. */
export function settingsToPayload(s: SettingsState) {
  const random = s.textType === "aleatoire"; // options et cartes de touches : réservées au texte aléatoire (CONF-06, CONF-07)
  // Les vrais passages sont tapés tels qu'écrits (le serveur ignore alors ces options) ; les accents
  // n'existent qu'en français (CONF-06).
  const accents = s.options.includes("Accents") && s.language === "fr";
  const punctuation = s.options.includes("Ponctuation");
  // On n'envoie que ce que le formulaire montre : une carte masquée (option décochée) ne garde pas d'effet caché.
  const visibleChars = (chars: string[]) =>
    random
      ? chars.filter(
          (c) =>
            LETTERS.includes(c) ||
            (punctuation && SYMBOLS.includes(c)) ||
            (s.options.includes("Nombres") && DIGITS.includes(c)),
        )
      : [];
  const name = normalizeRoomName(s.name);
  return {
    ...(name ? { name } : {}),
    access: s.access,
    language: s.language,
    durationSeconds: s.duration,
    maxPlayers: s.lobbySize,
    textType: s.textType,
    textLength: s.length,
    complexity: s.complexity,
    comebackBonus: s.comebackBonus && s.bonusKinds.length > 0,
    bonusKinds: s.bonusKinds,
    errorMode: s.errorMode,
    penaltySeconds: s.penalty ? 1 : 0,
    uppercase: s.options.includes("Majuscules"),
    punctuation,
    digits: s.options.includes("Nombres"),
    accents,
    includeChars: visibleChars(s.includeChars),
    excludeChars: visibleChars(s.excludeChars),
    accentWanted: accents && random ? s.accentWanted : [],
    accentForbidden: accents && random ? s.accentForbidden : [],
  };
}

export function settingsFromLobby(l: LobbyView["lobby"]): SettingsState {
  const options: TextOption[] = [];
  if (l.uppercase) options.push("Majuscules");
  if (l.punctuation) options.push("Ponctuation");
  if (l.digits) options.push("Nombres");
  if (l.accents) options.push("Accents");
  return {
    name: l.name,
    access: l.access as Access,
    language: l.language as "fr" | "en",
    duration: l.durationSeconds,
    lobbySize: l.maxPlayers,
    errorMode: l.errorMode as ErrorMode,
    penalty: l.penaltySeconds > 0,
    textType: l.textType as TextType,
    length: l.textLength,
    complexity: l.complexity as Difficulty,
    includeChars: l.includeChars,
    excludeChars: l.excludeChars,
    accentWanted: toAccentTypes(l.accentWanted),
    accentForbidden: toAccentTypes(l.accentForbidden),
    options,
    comebackBonus: l.comebackBonus,
    bonusKinds: toBonusKinds(l.bonusKinds),
  };
}

export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** État d'une touche : neutre (dans aucune liste), « souvent » ou « jamais ». */
export function choiceState<T>(
  value: T,
  wanted: readonly T[],
  forbidden: readonly T[],
): ChoiceState {
  if (forbidden.includes(value)) return "forbidden";
  return wanted.includes(value) ? "wanted" : "neutral";
}

/** Un clic de plus sur une touche : neutre → souvent (vert) → jamais (rouge) → neutre. */
export function cycleChoice<T>(
  value: T,
  wanted: readonly T[],
  forbidden: readonly T[],
): { wanted: T[]; forbidden: T[] } {
  const rest = (list: readonly T[]) => list.filter((v) => v !== value);
  switch (choiceState(value, wanted, forbidden)) {
    case "neutral":
      return { wanted: [...wanted, value], forbidden: [...forbidden] };
    case "wanted":
      return { wanted: rest(wanted), forbidden: [...forbidden, value] };
    case "forbidden":
      return { wanted: [...wanted], forbidden: rest(forbidden) };
  }
}

/** Interrupteur général des bonus : le réactiver sans aucun type choisi les remet tous. */
export function setBonusEnabled(s: SettingsState, enabled: boolean): Partial<SettingsState> {
  if (!enabled) return { comebackBonus: false };
  return {
    comebackBonus: true,
    bonusKinds: s.bonusKinds.length > 0 ? s.bonusKinds : [...BONUS_KINDS],
  };
}

/** Coche ou décoche un type de bonus ; décocher le dernier coupe l'interrupteur général. */
export function toggleBonusKind(s: SettingsState, kind: BonusKind): Partial<SettingsState> {
  const bonusKinds = BONUS_KINDS.filter((k) =>
    k === kind ? !s.bonusKinds.includes(k) : s.bonusKinds.includes(k),
  );
  return { bonusKinds, comebackBonus: bonusKinds.length > 0 };
}
