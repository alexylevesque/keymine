import type { Difficulty, Language, TextType } from "@/db/types";
import { accentTypesIn, type AccentType } from "./accents";
import { hasAccent, wordMatchesComplexity } from "./difficulty";

// Génération du texte d'une course (CONF-02 à CONF-07). Fonction pure : le
// corpus est fourni par l'appelant (base de données ou repli embarqué) et le
// hasard est injectable, pour des tests reproductibles.

export type CorpusText = {
  title: string;
  language: Language;
  difficulty: Difficulty;
  content: string;
};

export type Corpus = { texts: CorpusText[]; words: Record<Language, string[]> };

export type GenerateOptions = {
  type: TextType; // CONF-03
  language: Language; // CONF-02
  length: number; // CONF-04 : nombre de mots
  complexity: Difficulty; // CONF-05
  uppercase: boolean; // CONF-06
  punctuation: boolean;
  digits: boolean;
  accents: boolean;
  /**
   * CONF-07 (texte aléatoire uniquement). Lettres : « à privilégier » (vert) et « interdites »
   * (rouge) ; les touches grises ne figurent dans aucune liste. Symboles : mêmes listes, mais seuls
   * les symboles interdits filtrent les mots ; ceux à privilégier ne servent qu'avec `punctuation`.
   */
  includeChars: string[];
  excludeChars: string[];
  /** CONF-06 : types d'accents à privilégier (texte aléatoire) ou interdits (les deux modes). */
  accentWanted?: AccentType[];
  accentForbidden?: AccentType[];
};

export class NoTextAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoTextAvailableError";
  }
}

export const MIN_WORDS = 5;
export const MAX_WORDS = 400;

type Rng = () => number;

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]!;
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

/** Ordre de préférence des passages : la complexité demandée d'abord, puis les plus proches. */
function difficultyPreference(wanted: Difficulty): Difficulty[] {
  const index = DIFFICULTY_ORDER.indexOf(wanted);
  return [...DIFFICULTY_ORDER].sort((a, b) => {
    const da = Math.abs(DIFFICULTY_ORDER.indexOf(a) - index);
    const db = Math.abs(DIFFICULTY_ORDER.indexOf(b) - index);
    return da - db;
  });
}

function coherentText(options: GenerateOptions, corpus: Corpus, rng: Rng): string {
  const candidates = corpus.texts.filter((t) => t.language === options.language);
  if (candidates.length === 0) {
    throw new NoTextAvailableError("Aucun passage dans le corpus pour cette langue");
  }
  const words: string[] = [];
  for (const level of difficultyPreference(options.complexity)) {
    for (const passage of shuffled(
      candidates.filter((t) => t.difficulty === level),
      rng,
    )) {
      // Les vrais passages sont tapés tels qu'écrits (majuscules, ponctuation, accents, chiffres) :
      // les options de texte et les cartes de touches ne s'appliquent qu'au texte aléatoire (CONF-06, CONF-07).
      const asWritten = passage.content.replace(/\s+/g, " ").trim();
      if (asWritten) words.push(...asWritten.split(" "));
      if (words.length >= options.length) return words.slice(0, options.length).join(" ");
    }
  }
  // Corpus plus court que la longueur demandée : on reprend les passages.
  if (words.length === 0) throw new NoTextAvailableError("Aucun passage compatible avec les options");
  const result: string[] = [];
  while (result.length < options.length) result.push(...words);
  return result.slice(0, options.length).join(" ");
}

const VOWELS = ["a", "e", "i", "o", "u"];

function includesAny(word: string, chars: string[]): boolean {
  const lower = word.toLowerCase();
  return chars.some((c) => lower.includes(c));
}

const IS_LETTER = /^\p{L}$/u;
const NATURAL_MARKS = [",", "."];

function randomText(options: GenerateOptions, corpus: Corpus, rng: Rng): string {
  const exclude = options.excludeChars.map((c) => c.toLowerCase()).filter(Boolean);
  const include = options.includeChars
    .map((c) => c.toLowerCase())
    .filter((c) => c && !exclude.includes(c)); // l'exclusion l'emporte
  // Les lettres à privilégier orientent le choix des mots ; les symboles sont ajoutés ensuite.
  const favoredLetters = include.filter((c) => IS_LETTER.test(c));
  const forbiddenAccents = options.accentForbidden ?? [];
  const favoredAccents = options.accents
    ? (options.accentWanted ?? []).filter((a) => !forbiddenAccents.includes(a))
    : [];

  const allowed = (word: string) => {
    if (includesAny(word, exclude)) return false;
    if (!options.accents) return !hasAccent(word);
    return forbiddenAccents.length === 0 || ![...accentTypesIn(word)].some((a) => forbiddenAccents.includes(a));
  };

  const dictionary = corpus.words[options.language].filter(allowed);
  let pool = dictionary.filter((w) => wordMatchesComplexity(w, options.complexity));
  if (pool.length === 0) pool = dictionary; // aucun mot de ce niveau : tout le dictionnaire permis
  if (pool.length === 0 && favoredLetters.length === 0) {
    throw new NoTextAvailableError("Aucun mot disponible avec ces restrictions");
  }

  const isFavored = (word: string) =>
    includesAny(word, favoredLetters) || [...accentTypesIn(word)].some((a) => favoredAccents.includes(a));
  const favoring = favoredLetters.length > 0 || favoredAccents.length > 0;
  const matching = favoring ? dictionary.filter(isFavored) : [];
  const vowels = VOWELS.filter((v) => !exclude.includes(v));

  const words: string[] = [];
  for (let i = 0; i < options.length; i++) {
    if (favoring && rng() < 0.7) {
      if (matching.length > 0) {
        words.push(pick(matching, rng));
      } else if (favoredLetters.length > 0) {
        // Aucun vrai mot ne contient ces caractères : on fabrique un mot autour d'eux.
        const c = pick(favoredLetters, rng);
        const filler = vowels.length > 0 ? pick(vowels, rng) : "";
        words.push(`${filler}${c}${filler}${c}`);
      } else {
        words.push(pick(pool, rng)); // accent souhaité mais absent du dictionnaire : un mot ordinaire
      }
    } else {
      words.push(pick(pool, rng));
    }
  }
  const wantedSymbols = options.punctuation ? include.filter((c) => !IS_LETTER.test(c) && !/\d/.test(c)) : [];
  const wantedDigits = options.digits ? include.filter((c) => /^\d$/.test(c)) : [];
  return decorate(words, options, exclude, wantedSymbols, wantedDigits, rng).join(" ");
}

// Où se place chaque symbole demandé dans le mot (CONF-07, carte des symboles).
const WRAPPERS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  ")": ["(", ")"],
  "[": ["[", "]"],
  "]": ["[", "]"],
  "{": ["{", "}"],
  "}": ["{", "}"],
  "<": ["<", ">"],
  ">": ["<", ">"],
  '"': ['"', '"'],
  "'": ["'", "'"],
  "`": ["`", "`"],
};
const PREFIXES = new Set(["@", "#", "$", "\\", "~"]);
const INFIXES = new Set(["+", "-", "=", "*", "/", "|", "&", "^", "_"]);

/** Ajoute un symbole à un mot (ou entre deux mots pour les opérateurs) sans jamais utiliser un symbole interdit. */
function withSymbol(word: string, next: string | undefined, symbol: string, exclude: string[]): [string, boolean] {
  const wrap = WRAPPERS[symbol];
  if (wrap) {
    const [open, close] = wrap;
    if (!exclude.includes(open) && !exclude.includes(close)) return [`${open}${word}${close}`, false];
    return [symbol === close ? `${word}${symbol}` : `${symbol}${word}`, false];
  }
  if (PREFIXES.has(symbol)) return [`${symbol}${word}`, false];
  if (INFIXES.has(symbol) && next) return [`${word}${symbol}${next}`, true]; // consomme le mot suivant
  return [`${word}${symbol}`, false];
}

function decorate(
  words: string[],
  options: GenerateOptions,
  exclude: string[],
  wantedSymbols: string[],
  wantedDigits: string[],
  rng: Rng,
): string[] {
  let out = [...words];

  if (options.uppercase) {
    out = out.map((w) => (rng() < 0.18 ? w[0]!.toUpperCase() + w.slice(1) : w));
  }

  if (options.digits) {
    const digits = "0123456789".split("").filter((d) => !exclude.includes(d));
    // Chiffres « souvent » (vert) : ils reviennent plus que les autres dans les nombres.
    const favored = digits.filter((d) => wantedDigits.includes(d));
    if (digits.length > 0) {
      const count = Math.max(1, Math.round(out.length / 12));
      for (let i = 0; i < count; i++) {
        const size = 1 + Math.floor(rng() * 3);
        const number = Array.from({ length: size }, () =>
          favored.length > 0 && rng() < 0.7 ? pick(favored, rng) : pick(digits, rng),
        ).join("");
        out.splice(Math.floor(rng() * (out.length + 1)), 0, number);
      }
    }
  }

  if (options.punctuation) {
    // Symboles demandés (vert) : environ un mot sur quatre en reçoit un.
    if (wantedSymbols.length > 0) {
      const decorated: string[] = [];
      for (let i = 0; i < out.length; i++) {
        const word = out[i]!;
        if (rng() < 0.25) {
          const [text, consumed] = withSymbol(word, out[i + 1], pick(wantedSymbols, rng), exclude);
          decorated.push(text);
          if (consumed) i++;
        } else {
          decorated.push(word);
        }
      }
      out = decorated;
    }

    const marks = NATURAL_MARKS.filter((m) => !exclude.includes(m));
    if (marks.length > 0) {
      out = out.map((w, i) => (i < out.length - 1 && rng() < 0.1 ? `${w}${pick(marks, rng)}` : w));
      if (marks.includes(".")) out[out.length - 1] = `${out[out.length - 1]}.`;
    }
  }

  return out;
}

/** Génère le texte d'une course selon les réglages de la salle. */
export function generateRaceText(
  options: GenerateOptions,
  corpus: Corpus,
  rng: Rng = Math.random,
): string {
  const length = Math.max(MIN_WORDS, Math.min(MAX_WORDS, Math.round(options.length)));
  const sized = { ...options, length };
  return sized.type === "coherent" ? coherentText(sized, corpus, rng) : randomText(sized, corpus, rng);
}
