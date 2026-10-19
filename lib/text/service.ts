import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { corpusWords } from "@/db/schema";
import type { Language } from "@/db/types";
import { BUNDLED_CORPUS } from "./corpus";
import { generateRaceText, type Corpus, type GenerateOptions } from "./generate";

// Texte d'une course : le corpus vient de la base de données (CONF-03,
// TECH-04) ; s'il est vide (base non initialisée par `bun run db:seed`),
// on retombe sur le corpus embarqué plutôt que de bloquer la partie.
const CACHE_MS = 60_000;
let cache: { corpus: Corpus; at: number } | null = null;

export async function loadCorpus(): Promise<Corpus> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.corpus;

  const texts = await db.query.corpusTexts.findMany({
    columns: { title: true, language: true, difficulty: true, content: true },
  });
  const wordRows = await db.query.corpusWords.findMany({
    columns: { language: true, word: true },
    orderBy: asc(corpusWords.frequency_rank),
  });

  const words: Record<Language, string[]> = { fr: [], en: [] };
  for (const row of wordRows) words[row.language].push(row.word);

  const corpus: Corpus =
    texts.length === 0 || words.fr.length === 0 || words.en.length === 0
      ? BUNDLED_CORPUS
      : { texts, words };
  cache = { corpus, at: Date.now() };
  return corpus;
}

export async function generateTextForRace(options: GenerateOptions): Promise<string> {
  return generateRaceText(options, await loadCorpus());
}
