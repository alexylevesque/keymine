// Données de démonstration (TECH-04) : corpus de textes, dictionnaires,
// comptes de démonstration et leur historique de courses. Idempotent : peut
// être relancé sans créer de doublons. Usage : `bun run db:seed`.
import bcrypt from "bcryptjs";
import { Client } from "pg";
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

async function seedCorpus(client: Client) {
  for (const p of PASSAGES) {
    await client.query(
      `insert into corpus_texts (language, title, source, content, word_count, difficulty, has_accents, has_digits, has_punctuation)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (language, content) do nothing`,
      [
        p.language,
        p.title,
        p.source,
        p.content,
        p.content.split(/\s+/).length,
        classifyText(p.content),
        hasAccent(p.content),
        /\d/.test(p.content),
        /[.,;:!?]/.test(p.content),
      ],
    );
  }
  for (const [language, words] of [
    ["fr", WORDS_FR],
    ["en", WORDS_EN],
  ] as const) {
    for (const [index, word] of words.entries()) {
      await client.query(
        `insert into corpus_words (language, word, frequency_rank, has_accents)
         values ($1, $2, $3, $4) on conflict (language, word) do nothing`,
        [language, word, index + 1, hasAccent(word)],
      );
    }
  }
}

async function seedUsers(client: Client) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const ids: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const { rows } = await client.query<{ id: string }>(
      `insert into users (username, password_hash, display_name)
       values ($1, $2, $3)
       on conflict (username) do update set display_name = excluded.display_name
       returning id`,
      [u.username, hash, u.displayName],
    );
    ids[u.username] = rows[0]!.id;
  }
  return ids;
}

const LETTERS = "etaoinshrdlucmfwypvbgkjqxz";

async function seedHistory(client: Client, userId: string, displayName: string, skill: number, seed: number) {
  const { rows } = await client.query<{ n: string }>(
    `select count(*) as n from race_participants where user_id = $1`,
    [userId],
  );
  if (Number(rows[0]!.n) > 0) return; // historique déjà créé

  const rng = createRng(seed);
  const races = 14;
  const keyCorrect: Record<string, number> = {};
  const keyErrors: Record<string, number> = {};

  for (let i = 0; i < races; i++) {
    const daysAgo = races - i;
    const finishedAt = new Date(Date.now() - daysAgo * 86_400_000 * 1.5 - rng() * 3_600_000);
    const wpm = Math.max(10, skill + (i - races / 2) * 0.8 + (rng() - 0.5) * 12);
    const accuracy = Math.min(100, Math.max(80, 92 + (rng() - 0.5) * 10));
    const passage = PASSAGES[Math.floor(rng() * PASSAGES.length)]!;
    const text = passage.content;
    const errors = Math.round(text.length * (1 - accuracy / 100));

    const lobby = await client.query<{ id: string }>(
      `insert into lobbies (code, host_user_id, name, status, language, closed_at, created_at)
       values ($1, $2, $3, 'closed', $4, $5, $5) returning id`,
      [`D${userId.slice(0, 3)}${i}${Math.floor(rng() * 90 + 10)}`.toUpperCase().slice(0, 8), userId, "Démo", passage.language, finishedAt],
    );
    const race = await client.query<{ id: string }>(
      `insert into races (lobby_id, text_content, language, status, starts_at, duration_seconds, ends_at, created_at)
       values ($1, $2, $3, 'finished', $4, 300, $5, $4) returning id`,
      [lobby.rows[0]!.id, text, passage.language, new Date(finishedAt.getTime() - 60_000), finishedAt],
    );

    const field = [
      { userId, name: null as string | null, bot: null as string | null, wpm },
      ...BOTS.map((b) => ({ userId: null, name: b.name, bot: b.level as string, wpm: b.wpm * (0.9 + rng() * 0.2) })),
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
      await client.query(
        `insert into race_participants
           (race_id, user_id, display_name, is_bot, bot_level, progress_chars, error_count, status, wpm, accuracy, finished_at, rank, key_correct, key_errors, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, 'finished', $8, $9, $10, $11, $12, $13, $10)`,
        [
          race.rows[0]!.id,
          entry.userId,
          isMe ? displayName : entry.name,
          !isMe,
          entry.bot,
          text.length,
          isMe ? errors : 0,
          Math.round(entry.wpm * 10) / 10,
          isMe ? Math.round(accuracy * 10) / 10 : 98,
          finishedAt,
          index + 1,
          JSON.stringify(kc),
          JSON.stringify(ke),
        ],
      );
    }
  }

  for (const char of new Set([...Object.keys(keyCorrect), ...Object.keys(keyErrors)])) {
    await client.query(
      `insert into key_stats (user_id, char, correct_count, error_count) values ($1, $2, $3, $4)
       on conflict (user_id, char) do update set correct_count = excluded.correct_count, error_count = excluded.error_count`,
      [userId, char, keyCorrect[char] ?? 0, keyErrors[char] ?? 0],
    );
  }

  await client.query(
    `update users set
       best_wpm = agg.best, total_races = agg.n, total_errors = agg.errs,
       total_chars_typed = agg.chars, last_race_at = agg.last
     from (
       select max(wpm) as best, count(*) as n, sum(error_count) as errs,
              sum(progress_chars) as chars, max(finished_at) as last
       from race_participants where user_id = $1 and status = 'finished'
     ) agg
     where users.id = $1`,
    [userId],
  );
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL manquant (voir .env.example).");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await seedCorpus(client);
    // SEED_DEMO_USERS=false : en production, ne crée pas les comptes publics de démonstration.
    if (process.env.SEED_DEMO_USERS !== "false") {
      const ids = await seedUsers(client);
      for (const [index, u] of DEMO_USERS.entries()) {
        await seedHistory(client, ids[u.username]!, u.displayName, u.skill, 1000 + index);
      }
    }
    const backfilled = await backfillXp(client);
    if (backfilled) console.log(`[seed] expérience calculée pour ${backfilled} participations`);
    const counts = await client.query(
      `select (select count(*) from corpus_texts) as textes, (select count(*) from corpus_words) as mots,
              (select count(*) from users) as utilisateurs, (select count(*) from races) as courses`,
    );
    console.log("[seed] terminé :", counts.rows[0]);
    console.log(`[seed] comptes de démonstration : ${DEMO_USERS.map((u) => u.username).join(", ")} (mot de passe : ${DEMO_PASSWORD})`);
  } finally {
    await client.end();
  }
}

await main();
