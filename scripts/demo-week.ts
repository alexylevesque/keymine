// Outil de démonstration (développement local seulement) : invente des courses gagnées la semaine passée
// et cette semaine par les comptes de démonstration, pour voir le classement, les classes, les prix
// (alice gagne la semaine passée en bronze) et les couronnes sans attendre une semaine.
// Usage : bun run demo:week     Refuse de toucher une base qui n'est pas sur cet ordinateur.
import { eq, inArray } from "drizzle-orm";
import {
  leagueHistory,
  lobbies,
  raceParticipants,
  races,
  users,
  weeklyRewards,
  weeklySettlements,
} from "@/db/schema";
import { previousWeekStart, weekStart } from "@/lib/league";
import { localDemoDb } from "./demo-db";

const { db, closeDb } = await localDemoDb();
const demoUsers = await db
  .select({ id: users.id, username: users.username })
  .from(users)
  .where(inArray(users.username, ["alice", "bruno", "camille", "dani", "eloi"]));
const id = (name: string) => demoUsers.find((u) => u.username === name)?.id;
if (!id("alice")) {
  console.error("[demo] comptes de démonstration introuvables (lance d'abord bun run db:seed).");
  process.exit(1);
}
const [lobby] = await db
  .insert(lobbies)
  .values({
    code: `D${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    host_user_id: id("alice")!,
    name: "Démo classement",
    status: "closed",
  })
  .returning({ id: lobbies.id });

/** Une course gagnée par `winner` contre un bot, le jour donné (midi, heure de Toronto). */
async function win(day: string, winner: string, wpm: number) {
  const at = new Date(`${day}T16:00:00Z`);
  const [race] = await db
    .insert(races)
    .values({
      lobby_id: lobby!.id,
      text_content: "demo",
      language: "fr",
      status: "finished",
      starts_at: at,
      duration_seconds: 60,
      created_at: at,
      ends_at: at,
    })
    .returning({ id: races.id });
  await db.insert(raceParticipants).values([
    {
      race_id: race!.id,
      user_id: winner,
      display_name: "demo",
      status: "finished",
      rank: 1,
      wpm,
      accuracy: 97,
      finished_at: at,
    },
    {
      race_id: race!.id,
      display_name: "Bot Noob",
      is_bot: true,
      bot_level: "noob",
      status: "finished",
      rank: 2,
      wpm: 15,
      finished_at: at,
    },
  ]);
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
await db.delete(weeklySettlements).where(eq(weeklySettlements.week_start, last));
await db.delete(weeklyRewards).where(eq(weeklyRewards.week_start, last));
await db.delete(leagueHistory).where(eq(leagueHistory.week_start, last));
await closeDb();
console.log("[demo] courses inventées : ouvre /classement (alice a gagné la semaine passée).");
