// Tout ce que la page CLASSEMENT affiche, en un seul appel (page serveur et rafraîchissement du client).
import { db } from "@/lib/db";
import {
  activeBoost,
  currentChampions,
  lastMove,
  lastWeekResults,
  loadBoard,
  loadWeek,
  pendingRewards,
  settleLastWeek,
  type BoardRow,
  type LastWeekRow,
  type Reward,
  type WeekRow,
} from "@/lib/leaderboard";
import {
  leagueMoves,
  LEAGUE_PRIZES,
  LEAGUE_OTHER_BOOST,
  MIN_WINS,
  weekEnd,
  weekStart,
  WPM_PRIZE,
} from "@/lib/league";

export type LeaderboardView = {
  boards: { level: BoardRow[]; wpm: BoardRow[]; wins: BoardRow[] };
  week: {
    league: number;
    rows: WeekRow[];
    endsAt: number;
    up: number;
    down: number;
    minWins: number;
  };
  /** userId → classe, pour les couronnes des champions de la semaine passée. */
  champions: [string, number][];
  lastWeek: LastWeekRow[];
  prizes: {
    league: typeof LEAGUE_PRIZES;
    otherBoost: typeof LEAGUE_OTHER_BOOST;
    wpm: typeof WPM_PRIZE;
  };
  me: {
    userId: string;
    league: number;
    rewards: Reward[];
    boost: number;
    boostUntil: number | null;
    lastMove: { from: number; to: number; position: number } | null;
  } | null;
  serverNow: number;
};

export async function loadLeaderboardView(
  userId: string | null,
  league: number | null,
  now = new Date(),
): Promise<LeaderboardView> {
  await settleLastWeek(now);
  const user = userId
    ? await db
        .selectFrom("users")
        .select(["league", "xp_boost", "xp_boost_until"])
        .where("id", "=", userId)
        .executeTakeFirst()
    : undefined;
  const shownLeague = league ?? user?.league ?? 0;
  const [level, wpm, wins, rows, champions, lastWeek] = await Promise.all([
    loadBoard("level", userId),
    loadBoard("wpm", userId),
    loadBoard("wins", userId),
    loadWeek(weekStart(now), shownLeague),
    currentChampions(now),
    lastWeekResults(now),
  ]);
  const moves = leagueMoves(rows.length);
  return {
    boards: { level, wpm, wins },
    week: {
      league: shownLeague,
      rows,
      endsAt: weekEnd(now).getTime(),
      up: moves.up,
      down: moves.down,
      minWins: MIN_WINS,
    },
    champions: [...champions.entries()],
    lastWeek,
    prizes: { league: LEAGUE_PRIZES, otherBoost: LEAGUE_OTHER_BOOST, wpm: WPM_PRIZE },
    me:
      userId && user
        ? {
            userId,
            league: user.league,
            rewards: await pendingRewards(userId),
            boost: activeBoost(user, now),
            boostUntil:
              activeBoost(user, now) > 0 && user.xp_boost_until
                ? new Date(user.xp_boost_until).getTime()
                : null,
            lastMove: await lastMove(userId, now),
          }
        : null,
    serverNow: now.getTime(),
  };
}
