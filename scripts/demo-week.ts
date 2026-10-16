// Outil de démonstration (développement local seulement) : invente des courses gagnées la semaine passée
// et cette semaine par les comptes de démonstration, pour voir le classement, les classes, les prix
// (alice gagne la semaine passée en bronze) et les couronnes sans attendre une semaine.
// Usage : bun run demo:week     Refuse de toucher une base qui n'est pas sur cet ordinateur.
import { Client } from "pg";
import { previousWeekStart, weekStart } from "@/lib/league";

const url = process.env.DATABASE_URL ?? "postgresql://keymine:keymine@127.0.0.1:54329/keymine";
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`[demo] base « ${host} » : ce script ne sert qu'en local, rien n'a été changé.`);
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
const { rows: users } = await client.query<{ id: string; username: string }>(
  `select id, username from users where username in ('alice', 'bruno', 'camille', 'dani', 'eloi')`,
);
const id = (name: string) => users.find((u) => u.username === name)?.id;
if (!id("alice")) {
  console.error("[demo] comptes de démonstration introuvables (lance d'abord bun run db:seed).");
  process.exit(1);
}
const host_ = id("alice")!;
const { rows: lobby } = await client.query<{ id: string }>(
  `insert into lobbies (code, host_user_id, name, status) values ($1, $2, 'Démo classement', 'closed') returning id`,
  [`D${Math.random().toString(36).slice(2, 7).toUpperCase()}`, host_],
);

/** Une course gagnée par `winner` contre un bot, le jour donné (midi, heure de Toronto). */
async function win(day: string, winner: string, wpm: number) {
  const at = `${day}T16:00:00Z`;
  const { rows } = await client.query<{ id: string }>(
    `insert into races (lobby_id, text_content, language, status, starts_at, duration_seconds, created_at, ends_at)
     values ($1, 'demo', 'fr', 'finished', $2, 60, $2, $2) returning id`,
    [lobby[0]!.id, at],
  );
  await client.query(
    `insert into race_participants (race_id, user_id, display_name, status, rank, wpm, accuracy, finished_at)
     values ($1, $2, 'demo', 'finished', 1, $3, 97, $4)`,
    [rows[0]!.id, winner, wpm, at],
  );
  await client.query(
    `insert into race_participants (race_id, display_name, is_bot, bot_level, status, rank, wpm, finished_at)
     values ($1, 'Bot Noob', true, 'noob', 'finished', 2, 15, $2)`,
    [rows[0]!.id, at],
  );
}

const now = new Date();
const last = previousWeekStart(now);
const day = (start: string, n: number) => {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// Semaine passée : alice 6, bruno 4, camille 3, dani 1.
const plan: [string, number, number][] = [
  ["alice", 6, 82],
  ["bruno", 4, 75],
  ["camille", 3, 91],
  ["dani", 1, 60],
];
for (const [name, count, wpm] of plan) {
  const user = id(name);
  if (user) for (let i = 0; i < count; i++) await win(day(last, i % 6), user, wpm + i);
}
// Cette semaine : quelques victoires pour voir la progression.
const current = weekStart(now);
for (const [name, count] of [
  ["bruno", 3],
  ["alice", 2],
  ["eloi", 1],
] as const) {
  const user = id(name);
  if (user) for (let i = 0; i < count; i++) await win(current, user, 70 + i);
}
// Les résultats de la semaine passée seront recalculés à la prochaine visite de la page CLASSEMENT.
await client.query(`delete from weekly_settlements where week_start = $1`, [last]);
await client.query(`delete from weekly_rewards where week_start = $1`, [last]);
await client.query(`delete from league_history where week_start = $1`, [last]);
await client.end();
console.log("[demo] courses inventées : ouvre /classement (alice a gagné la semaine passée).");
