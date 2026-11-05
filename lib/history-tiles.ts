import { and, avg, desc, eq, gte, inArray, isNotNull, lt, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { raceParticipants } from "@/db/schema";

// Petits dessins des tuiles de l'Historique et du Profil (maquette) : une case par course récente,
// les derniers MPM, la date du record et l'évolution de la moyenne ce mois-ci.

export type RaceDot = "win" | "played" | "abandoned" | "spectated";

export type HistoryTiles = {
  dots: RaceDot[];
  recentWpm: number[];
  bestAt: Date | null;
  /** Moyenne de ce mois-ci moins celle d'avant (null si l'une des deux manque). */
  monthDelta: number | null;
  /** Meilleur MPM de cette semaine moins le meilleur d'avant (null si l'un des deux manque). */
  weekDelta: number | null;
  /** Jours de cette semaine (lundi → dimanche) où le joueur a fait une course. */
  weekDays: boolean[];
};

export function dotOf(row: { role: string; status: string; rank: number | null }): RaceDot {
  if (row.role === "spectator") return "spectated";
  if (row.status === "abandoned") return "abandoned";
  return row.rank === 1 ? "win" : "played";
}

export async function loadHistoryTiles(userId: string, now = new Date()): Promise<HistoryTiles> {
  const rp = raceParticipants;
  const played = and(
    eq(rp.user_id, userId),
    eq(rp.role, "participant"),
    inArray(rp.status, ["finished", "timeout"]),
    isNotNull(rp.wpm),
  );
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Lundi de cette semaine, 0 h (heure locale du serveur).
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - ((now.getDay() + 6) % 7),
  );
  const [recent, wpms, best, thisMonth, before, weekRows, bestBefore] = await Promise.all([
    db.query.raceParticipants.findMany({
      columns: { role: true, status: true, rank: true },
      where: eq(rp.user_id, userId),
      orderBy: desc(rp.created_at),
      limit: 16,
    }),
    db.query.raceParticipants.findMany({
      columns: { wpm: true },
      where: played,
      orderBy: desc(rp.created_at),
      limit: 8,
    }),
    db.query.raceParticipants.findFirst({
      columns: { created_at: true },
      where: played,
      orderBy: [desc(rp.wpm), desc(rp.created_at)],
    }),
    db
      .select({ v: avg(rp.wpm) })
      .from(rp)
      .where(and(played, gte(rp.created_at, monthStart))),
    db
      .select({ v: avg(rp.wpm) })
      .from(rp)
      .where(and(played, lt(rp.created_at, monthStart))),
    db.query.raceParticipants.findMany({
      columns: { created_at: true, wpm: true },
      where: and(eq(rp.user_id, userId), eq(rp.role, "participant"), gte(rp.created_at, weekStart)),
    }),
    db
      .select({ v: max(rp.wpm) })
      .from(rp)
      .where(and(played, lt(rp.created_at, weekStart))),
  ]);
  const weekDays = Array.from({ length: 7 }, () => false);
  let weekBest: number | null = null;
  for (const r of weekRows) {
    weekDays[(new Date(r.created_at).getDay() + 6) % 7] = true;
    if (r.wpm != null) weekBest = Math.max(weekBest ?? 0, r.wpm);
  }
  const prevBest = bestBefore[0]?.v;
  const a = thisMonth[0]?.v;
  const b = before[0]?.v;
  return {
    dots: recent.reverse().map(dotOf),
    recentWpm: wpms.map((w) => w.wpm ?? 0).reverse(),
    bestAt: best ? new Date(best.created_at) : null,
    monthDelta: a != null && b != null ? Math.round(Number(a) - Number(b)) : null,
    weekDelta:
      weekBest != null && prevBest != null ? Math.round(weekBest - Number(prevBest)) : null,
    weekDays,
  };
}
