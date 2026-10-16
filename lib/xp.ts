// Expérience et niveaux (fonctionnalité ajoutée, validée par l'étudiant le 16 oct. 2026).
// Niveaux : même courbe que Minecraft, sans niveau maximum. XP d'une course :
//   10 × complexité × longueur × adversaires × place, + bonus de précision.
// Abandon volontaire : on perd un niveau complet (la barre garde son pourcentage).
import type { BotLevel, Difficulty } from "@/db/types";

/** XP pour passer du niveau `level` au suivant (formule de Minecraft). */
export function xpToNextLevel(level: number): number {
  if (level <= 15) return 2 * level + 7;
  if (level <= 30) return 5 * level - 38;
  return 9 * level - 158;
}

/** XP totale nécessaire pour atteindre le début du niveau `level`. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += xpToNextLevel(l);
  return total;
}

export type LevelProgress = {
  level: number;
  /** XP déjà faite dans le niveau courant. */
  intoLevel: number;
  /** XP nécessaire pour finir le niveau courant. */
  needed: number;
  /** Remplissage de la barre, de 0 à 1. */
  fraction: number;
};

export function levelFromXp(totalXp: number): LevelProgress {
  let rest = Math.max(0, Math.floor(totalXp));
  let level = 0;
  while (rest >= xpToNextLevel(level)) {
    rest -= xpToNextLevel(level);
    level++;
  }
  const needed = xpToNextLevel(level);
  return { level, intoLevel: rest, needed, fraction: rest / needed };
}

/** XP perdue en abandonnant : un niveau complet, la barre garde le même pourcentage. Rien au niveau 0. */
export function abandonPenalty(totalXp: number): number {
  const { level, fraction } = levelFromXp(totalXp);
  if (level === 0) return 0;
  const after = totalXpForLevel(level - 1) + Math.floor(fraction * xpToNextLevel(level - 1));
  return Math.max(0, Math.floor(totalXp) - after);
}

export const COMPLEXITY_FACTOR: Record<Difficulty, number> = { easy: 1, medium: 1.5, hard: 2 };

/** Poids d'un adversaire : plus il est fort, plus la course rapporte. */
export const BOT_WEIGHT: Record<BotLevel, number> = {
  noob: 0.5,
  debutant: 1,
  intermediaire: 1.5,
  expert: 2,
  impossible: 3,
};
export const HUMAN_WEIGHT = 2;
export const MAX_OPPONENT_FACTOR = 4;

export type Opponent = { isBot: boolean; botLevel: BotLevel | null };

export type RaceXpInput = {
  complexity: Difficulty;
  /** Longueur du texte en mots. */
  words: number;
  /** Les autres participants de la course (pas les spectateurs). */
  opponents: readonly Opponent[];
  status: "finished" | "timeout" | "abandoned" | "racing";
  /** Rang final (1 = premier). */
  rank: number;
  /** Précision en pourcentage (0 à 100). */
  accuracy: number;
};

export function lengthFactor(words: number): number {
  return Math.min(3, Math.max(0.5, words / 40));
}

export function opponentFactor(opponents: readonly Opponent[]): number {
  const weight = opponents.reduce(
    (sum, o) => sum + (o.isBot ? BOT_WEIGHT[o.botLevel ?? "noob"] : HUMAN_WEIGHT),
    0,
  );
  return Math.min(MAX_OPPONENT_FACTOR, 1 + weight / 10);
}

export function placeFactor(status: RaceXpInput["status"], rank: number): number {
  if (status !== "finished") return 0.5; // temps écoulé sans finir le texte
  if (rank === 1) return 2;
  if (rank === 2) return 1.5;
  if (rank === 3) return 1.25;
  return 1;
}

export function accuracyBonus(accuracy: number): number {
  if (accuracy >= 100) return 10;
  if (accuracy >= 95) return 5;
  return 0;
}

/** XP gagnée pour une course terminée (fini ou temps écoulé). Un abandon ne rapporte rien. */
export function raceXp(input: RaceXpInput): number {
  if (input.status === "abandoned") return 0;
  const base =
    10 *
    COMPLEXITY_FACTOR[input.complexity] *
    lengthFactor(input.words) *
    opponentFactor(input.opponents) *
    placeFactor(input.status, input.rank);
  return Math.round(base) + accuracyBonus(input.accuracy);
}

/** Complexité de la course (enregistrée au départ) ; à défaut, celle de la salle. */
export function raceComplexity(settings: unknown, fallback: Difficulty): Difficulty {
  const value = (settings as { complexity?: unknown } | null)?.complexity;
  return value === "easy" || value === "medium" || value === "hard" ? value : fallback;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
