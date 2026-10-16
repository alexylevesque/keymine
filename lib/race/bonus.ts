// BONUS-01 à BONUS-04 — règle des bonus de remontée (documentée dans
// docs/ARCHITECTURE.md, §7).
//
// Points de contrôle : quand le MENEUR passe 25 %, 50 % puis 75 % de son
// texte. À chaque point de contrôle, est en retard tout participant qui est
// dernier, ou à plus de 25 points de pourcentage derrière le meneur. Chaque
// retardataire reçoit UN bonus par point de contrôle, au plus 3 par course.

export const CHECKPOINTS = [0.25, 0.5, 0.75] as const;
export const MAX_BONUSES_PER_PLAYER = 3;
export const LAG_THRESHOLD = 0.25;
export const BONUS_WORDS = 3;
export const FOG_DURATION_MS = 5_000;

// CONF-09 : l'hôte choisit lesquels de ces bonus peuvent être attribués.
export const BONUS_KINDS = ["minus_words", "plus_words", "fog"] as const;
export type BonusKind = (typeof BONUS_KINDS)[number];

/** Libellés pour l'annonce visuelle (BONUS-03). */
export const BONUS_LABELS: Record<BonusKind, string> = {
  minus_words: "-3 mots",
  plus_words: "+3 mots au meneur",
  fog: "Brouillard sur le meneur",
};

/** Pourquoi un malus n'a pas touché sa cible (équipement de l'inventaire). */
export type BonusBlock = "apple" | "night_vision" | "shield" | "feather" | "dodge";

export type BonusRecord = {
  kind: BonusKind;
  checkpoint: number; // 0.25, 0.5 ou 0.75
  atMs: number; // instant de la course (ms depuis le départ)
  beneficiaryId: string; // le retardataire qui reçoit le bonus
  targetId: string; // le participant dont le texte/affichage est modifié
  /** Malus arrêté par l'équipement de la cible : le texte et l'affichage ne changent pas. */
  blocked?: BonusBlock;
  /** Épines : la cible a renvoyé du brouillard au retardataire. */
  thorns?: true;
};

/** Protection d'un joueur contre les malus, figée au départ (voir lib/inventory.ts). */
export type Protection = {
  dodge: number;
  immuneAll: boolean;
  immuneFog: boolean;
  shield: number;
  /** Enchantements (facultatifs) : Chute amortie, Respiration, Épines. */
  plusWordsBlock?: number;
  fogReductionMs?: number;
  thorns?: number;
};

/**
 * Le malus `kind` est-il arrêté ? Pomme : tout ; vision nocturne : le brouillard ; bouclier : le premier
 * malus (une charge) ; sinon l'armure donne une chance d'esquive (`roll` renvoie un nombre dans [0, 1[ ;
 * il n'est tiré que si le joueur porte de l'armure, pour ne pas changer les tirages des autres courses).
 */
export function blockMalus(kind: BonusKind, p: Protection, roll: () => number): BonusBlock | null {
  if (p.immuneAll) return "apple";
  if (kind === "fog" && p.immuneFog) return "night_vision";
  if (p.shield > 0) {
    p.shield -= 1;
    return "shield";
  }
  if (kind === "plus_words" && (p.plusWordsBlock ?? 0) > 0 && roll() < p.plusWordsBlock!) {
    return "feather";
  }
  return p.dodge > 0 && roll() < p.dodge ? "dodge" : null;
}

export type ProgressView = { id: string; fraction: number };

/** Identifie le meneur : plus grande progression, premier de la liste en cas d'égalité. */
export function findLeader<T extends ProgressView>(racers: readonly T[]): T | null {
  let leader: T | null = null;
  for (const r of racers) if (!leader || r.fraction > leader.fraction) leader = r;
  return leader;
}

/** Retardataires à un point de contrôle : dernier, ou à plus de 25 points du meneur. Le meneur n'est jamais en retard. */
export function findLaggards<T extends ProgressView>(racers: readonly T[], leader: T): T[] {
  if (racers.length < 2) return [];
  const min = Math.min(...racers.map((r) => r.fraction));
  return racers.filter(
    (r) =>
      r.id !== leader.id && (r.fraction === min || leader.fraction - r.fraction > LAG_THRESHOLD),
  );
}

/** Position du début du mot qui suit le mot courant (le joueur est en `progress`). */
function nextWordStart(text: string, progress: number): number {
  let i = Math.min(progress, text.length);
  while (i < text.length && text[i] !== " ") i++; // fin du mot courant
  while (i < text.length && text[i] === " ") i++; // espaces
  return i;
}

/** Nombre de mots restants après le mot courant. */
export function wordsAfterCurrent(text: string, progress: number): number {
  const start = nextWordStart(text, progress);
  return text.slice(start).split(" ").filter(Boolean).length;
}

/**
 * -3 mots : retire `count` mots juste après le mot courant. Renvoie le texte
 * inchangé s'il n'en reste pas assez (au moins un mot doit rester à taper).
 */
export function removeUpcomingWords(text: string, progress: number, count = BONUS_WORDS): string {
  const start = nextWordStart(text, progress);
  const rest = text.slice(start).split(" ").filter(Boolean);
  if (rest.length < count + 1) return text;
  return text.slice(0, start) + rest.slice(count).join(" ");
}

/** +3 mots : ajoute des mots à la fin du texte. */
export function appendWords(text: string, words: readonly string[]): string {
  return words.length === 0 ? text : `${text} ${words.join(" ")}`;
}
