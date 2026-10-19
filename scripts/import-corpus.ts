// Importe dans `corpus_texts` des passages tirés de livres du domaine public (Project Gutenberg).
// Usage : `bun run db:import-corpus` (base migrée ; accès Internet requis).
// Idempotent : un passage déjà présent (même langue et même texte) est ignoré.
import { closeDb, db } from "../lib/db";
import { corpusTexts } from "../db/schema";
import { BOOKS } from "../db/seed-data/books";
import { classifyText, hasAccent } from "../lib/text/difficulty";
import { DEFAULT_EXTRACT, extractPassages } from "../lib/text/gutenberg";

async function download(id: number): Promise<string> {
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
  ];
  for (const url of urls) {
    const response = await fetch(url);
    if (response.ok) return response.text();
  }
  throw new Error(`livre ${id} introuvable sur gutenberg.org`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant (voir .env.example).");
  let added = 0;
  try {
    for (const book of BOOKS) {
      let raw: string;
      try {
        raw = await download(book.id);
      } catch (error) {
        console.warn(`✗ ${book.title} : ${(error as Error).message}`);
        continue;
      }
      if (!raw.toUpperCase().includes(book.check)) {
        console.warn(
          `✗ ${book.title} : le texte téléchargé ne mentionne pas « ${book.check} » (mauvais identifiant ${book.id} ?), ignoré`,
        );
        continue;
      }
      const passages = extractPassages(raw, DEFAULT_EXTRACT);
      let inserted = 0;
      for (const content of passages) {
        const result = await db
          .insert(corpusTexts)
          .values({
            language: book.language,
            title: book.title,
            source: `${book.author}, ${book.title} (Project Gutenberg #${book.id}, domaine public)`,
            content,
            word_count: content.split(/\s+/).length,
            difficulty: classifyText(content),
            has_accents: hasAccent(content),
            has_digits: /\d/.test(content),
            has_punctuation: /[.,;:!?]/.test(content),
          })
          .onConflictDoNothing({ target: [corpusTexts.language, corpusTexts.content] });
        inserted += result.rowCount ?? 0;
      }
      added += inserted;
      console.log(`✓ ${book.title} : ${passages.length} passages extraits, ${inserted} nouveaux`);
    }
  } finally {
    await closeDb();
  }
  console.log(`Terminé : ${added} passages ajoutés.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
