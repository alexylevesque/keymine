// Données de démonstration (TECH-04) : corpus de textes, dictionnaires,
// comptes de démonstration et leur historique de courses. Idempotent : peut
// être relancé sans créer de doublons. Usage : `bun run db:seed`.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import {
  corpusTexts,
  corpusWords,
  keyStats,
  lobbies,
  raceParticipants,
  races,
  users,
} from "@/db/schema";
import type { BotLevel } from "@/db/types";
import { recomputeUserStats } from "@/lib/stats";
import { classifyText, hasAccent } from "@/lib/text/difficulty";
import { createRng } from "@/lib/text/rng";
import { PASSAGES } from "./seed-data/corpus";
import { WORDS_EN, WORDS_FR } from "./seed-data/words";
import { backfillXp } from "./xp-backfill";

export const DEMO_PASSWORD = "demo1234";
export const DEMO_USERS = [
  { username: "alice", displayName: "Alice", skill: 62 },
  { username: "bruno", displayName: "Bruno", skill: 48 },
  { username: "camille", displayName: "Camille", skill: 85 },
  { username: "dani", displayName: "Dani", skill: 35 },
  { username: "eloi", displayName: "Éloi", skill: 72 },
] as const;

const BOTS = [
  { level: "debutant", name: "Bot debutant", wpm: 25 },
  { level: "intermediaire", name: "Bot intermediaire", wpm: 45 },
  { level: "expert", name: "Bot expert", wpm: 80 },
] as const;

async function seedCorpus() {
  for (const p of PASSAGES) {
    await db
      .insert(corpusTexts)
      .values({
        language: p.language,
        title: p.title,
        source: p.source,
        content: p.content,
        word_count: p.content.split(/\s+/).length,
        difficulty: classifyText(p.content),
        has_accents: hasAccent(p.content),
        has_digits: /\d/.test(p.content),
        has_punctuation: /[.,;:!?]/.test(p.content),
      })
      .onConflictDoNothing({ target: [corpusTexts.language, corpusTexts.content] });
  }
  for (const [language, words] of [
    ["fr", WORDS_FR],
    ["en", WORDS_EN],
  ] as const) {
    for (const [index, word] of words.entries()) {
      await db
        .insert(corpusWords)
        .values({ language, word, frequency_rank: index + 1, has_accents: hasAccent(word) })
        .onConflictDoNothing({ target: [corpusWords.language, corpusWords.word] });
    }
  }
}

async function seedUsers() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const [row] = await db
      .insert(users)
      .values({ username: u.username, password_hash: hash, display_name: u.displayName })
      .onConflictDoUpdate({ target: users.username, set: { display_name: u.displayName } })
      .returning({ id: users.id });
    ids[u.username] = row!.id;
  }
  return ids;
}

const LETTERS = "etaoinshrdlucmfwypvbgkjqxz";

async function seedHistory(userId: string, displayName: string, skill: number, seed: number) {
  const existing = await db.$count(raceParticipants, eq(raceParticipants.user_id, userId));
  if (existing > 0) return; // historique déjà créé

  const rng = createRng(seed);
  const raceCount = 14;
  const keyCorrect: Record<string, number> = {};
  const keyErrors: Record<string, number> = {};

  for (let i = 0; i < raceCount; i++) {
    const daysAgo = raceCount - i;
    const finishedAt = new Date(Date.now() - daysAgo * 86_400_000 * 1.5 - rng() * 3_600_000);
    const wpm = Math.max(10, skill + (i - raceCount / 2) * 0.8 + (rng() - 0.5) * 12);
    const accuracy = Math.min(100, Math.max(80, 92 + (rng() - 0.5) * 10));
    const passage = PASSAGES[Math.floor(rng() * PASSAGES.length)]!;
    const text = passage.content;
    const errors = Math.round(text.length * (1 - accuracy / 100));

    const [lobby] = await db
      .insert(lobbies)
      .values({
        code: `D${userId.slice(0, 3)}${i}${Math.floor(rng() * 90 + 10)}`.toUpperCase().slice(0, 8),
        host_user_id: userId,
        name: "Démo",
        status: "closed",
        language: passage.language,
        closed_at: finishedAt,
        created_at: finishedAt,
      })
      .returning({ id: lobbies.id });
    const startedAt = new Date(finishedAt.getTime() - 60_000);
    const [race] = await db
      .insert(races)
      .values({
        lobby_id: lobby!.id,
        text_content: text,
        language: passage.language,
        status: "finished",
        starts_at: startedAt,
        duration_seconds: 300,
        ends_at: finishedAt,
        created_at: startedAt,
      })
      .returning({ id: races.id });

    const field = [
      { userId, name: null as string | null, bot: null as BotLevel | null, wpm },
      ...BOTS.map((b) => ({
        userId: null,
        name: b.name,
        bot: b.level as BotLevel,
        wpm: b.wpm * (0.9 + rng() * 0.2),
      })),
    ].sort((a, b) => b.wpm - a.wpm);

    for (const [index, entry] of field.entries()) {
      const isMe = entry.userId === userId;
      const kc: Record<string, number> = {};
      const ke: Record<string, number> = {};
      if (isMe) {
        for (const ch of text.toLowerCase()) {
          if (ch === " ") continue;
          kc[ch] = (kc[ch] ?? 0) + 1;
        }
        for (let e = 0; e < errors; e++) {
          const ch = LETTERS[Math.floor(rng() * rng() * LETTERS.length)]!;
          ke[ch] = (ke[ch] ?? 0) + 1;
        }
        for (const [k, v] of Object.entries(kc)) keyCorrect[k] = (keyCorrect[k] ?? 0) + v;
        for (const [k, v] of Object.entries(ke)) keyErrors[k] = (keyErrors[k] ?? 0) + v;
      }
      await db.insert(raceParticipants).values({
        race_id: race!.id,
        user_id: entry.userId,
        display_name: isMe ? displayName : (entry.name ?? displayName),
        is_bot: !isMe,
        bot_level: entry.bot,
        progress_chars: text.length,
        error_count: isMe ? errors : 0,
        status: "finished",
        wpm: Math.round(entry.wpm * 10) / 10,
        accuracy: isMe ? Math.round(accuracy * 10) / 10 : 98,
        finished_at: finishedAt,
        rank: index + 1,
        key_correct: kc,
        key_errors: ke,
        created_at: finishedAt,
      });
    }
  }

  for (const char of new Set([...Object.keys(keyCorrect), ...Object.keys(keyErrors)])) {
    const counts = { correct_count: keyCorrect[char] ?? 0, error_count: keyErrors[char] ?? 0 };
    await db
      .insert(keyStats)
      .values({ user_id: userId, char, ...counts })
      .onConflictDoUpdate({ target: [keyStats.user_id, keyStats.char], set: counts });
  }

  await recomputeUserStats(userId);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant (voir .env.example).");
  try {
    await seedCorpus();
    // SEED_DEMO_USERS=false : en production, ne crée pas les comptes publics de démonstration.
    if (process.env.SEED_DEMO_USERS !== "false") {
      const ids = await seedUsers();
      for (const [index, u] of DEMO_USERS.entries()) {
        await seedHistory(ids[u.username]!, u.displayName, u.skill, 1000 + index);
      }
    }
    const backfilled = await backfillXp();
    if (backfilled) console.log(`[seed] expérience calculée pour ${backfilled} participations`);
    const counts = {
      textes: await db.$count(corpusTexts),
      mots: await db.$count(corpusWords),
      utilisateurs: await db.$count(users),
      courses: await db.$count(races),
    };
    console.log("[seed] terminé :", counts);
    console.log(
      `[seed] comptes de démonstration : ${DEMO_USERS.map((u) => u.username).join(", ")} (mot de passe : ${DEMO_PASSWORD})`,
    );
  } finally {
    await closeDb();
  }
}

await main();
