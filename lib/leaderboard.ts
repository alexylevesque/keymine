// Classement et classes (fonctionnalité ajoutée, règles validées par l'étudiant le 16 oct. 2026).
// - Classement général : niveau, meilleur MPM, courses gagnées (temps réel).
// - Classes : bronze, argent, or, diamant, netherite. Chaque semaine (lundi 0 h → dimanche 23 h 59, heure
//   de Toronto), chacun est classé contre sa classe par courses gagnées ; les premiers montent, les
//   derniers descendent, et il y a des prix par classe.
// Les résultats d'une semaine sont calculés une seule fois, au premier passage après sa fin (pas de tâche
// de fond), puis chaque gagnant récupère son prix (bouton RÉCUPÉRER : rien n'est perdu si le sac est plein).
// Une victoire = 1re place d'une course finie avec au moins un adversaire (un bot compte).
// Sans dépendance à Next.js : aussi utilisé par le serveur temps réel (couronnes).
import { and, asc, count, desc, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Db, type Tx } from "@/lib/db";
import {
  leagueHistory,
  raceParticipants,
  races,
  users,
  weeklyRewards,
  weeklySettlements,
} from "@/db/schema";
import { addToBag, bagFits, newStack } from "@/lib/inventory";
import { withInventory } from "@/lib/inventory-store";
import { isItemId, type ItemId } from "@/lib/items";
import {
  addDays,
  BOOST_DAYS,
  leaguePrize,
  MIN_WINS,
  nextLeague,
  previousWeekStart,
  WPM_PRIZE,
  type Prize,
} from "@/lib/league";

export {
  LEAGUES,
  weekEnd,
  weekStart,
  previousWeekStart,
  MIN_WINS,
  leagueMoves,
  type League,
} from "@/lib/league";

// ---- Requêtes ----

type Q = Db | Tx;

/** Une course compte si elle a au moins deux participants (un bot compte). */
function hasOpponent(q: Q) {
  const other = alias(raceParticipants, "o");
  const opponents = q
    .select({ n: count() })
    .from(other)
    .where(and(eq(other.race_id, raceParticipants.race_id), eq(other.role, "participant")));
  return sql`(${opponents}) >= 2`;
}

export const BOARDS = ["level", "wpm", "wins"] as const;
export type Board = (typeof BOARDS)[number];

export type BoardRow = {
  position: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  league: number;
  xp: number;
  bestWpm: number;
  wins: number;
};

export const BOARD_SIZE = 50;

/** Classement général : top 50, plus la ligne de `me` s'il est plus loin. */
export async function loadBoard(board: Board, me: string | null, q: Q = db): Promise<BoardRow[]> {
  const rp = raceParticipants;
  const w = q.$with("w").as(
    q
      .select({ user_id: rp.user_id, wins: sql<number>`count(*)::int`.as("wins") })
      .from(rp)
      .where(
        and(
          isNotNull(rp.user_id),
          eq(rp.is_bot, false),
          eq(rp.role, "participant"),
          eq(rp.status, "finished"),
          eq(rp.rank, 1),
          hasOpponent(q),
        ),
      )
      .groupBy(rp.user_id),
  );
  const wins = sql<number>`coalesce(${w.wins}, 0)`;
  const order = {
    level: sql`${users.xp_total} desc, ${users.best_wpm} desc, ${users.id}`,
    wpm: sql`${users.best_wpm} desc, ${users.xp_total} desc, ${users.id}`,
    wins: sql`${wins} desc, ${users.best_wpm} desc, ${users.id}`,
  }[board];
  const filter = {
    level: gt(users.xp_total, 0),
    wpm: gt(users.best_wpm, 0),
    wins: sql`${wins} > 0`,
  }[board];
  const ranked = q.$with("ranked").as(
    q
      .with(w)
      .select({
        id: users.id,
        display_name: users.display_name,
        avatar_url: users.avatar_url,
        league: users.league,
        xp_total: users.xp_total,
        best_wpm: users.best_wpm,
        wins: wins.as("wins"),
        pos: sql<number>`(row_number() over (order by ${order}))::int`.as("pos"),
      })
      .from(users)
      .leftJoin(w, eq(w.user_id, users.id))
      .where(filter),
  );
  const rows = await q
    .with(ranked)
    .select()
    .from(ranked)
    .where(or(lte(ranked.pos, BOARD_SIZE), me ? eq(ranked.id, me) : undefined))
    .orderBy(asc(ranked.pos));
  return rows.map((r) => ({
    position: r.pos,
    userId: r.id,
    name: r.display_name,
    avatarUrl: r.avatar_url,
    league: r.league,
    xp: r.xp_total,
    bestWpm: Number(r.best_wpm),
    wins: Number(r.wins),
  }));
}

export type WeekRow = {
  position: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  league: number;
  wins: number;
  races: number;
  bestWpm: number;
};

/**
 * Semaine qui commence le lundi `from` : joueurs actifs (au moins une course jouée), classés dans leur
 * classe par victoires, puis meilleur MPM de la semaine. `league` limite à une classe.
 */
export async function loadWeek(
  from: string,
  league: number | null = null,
  q: Q = db,
): Promise<WeekRow[]> {
  const rp = raceParticipants;
  const counted = sql`${rp.status} = 'finished' and ${hasOpponent(q)}`;
  // Jour de la course, heure de Toronto.
  const day = sql`(coalesce(${rp.finished_at}, ${races.ends_at}, ${races.created_at}) at time zone 'America/Toronto')::date`;
  const played = q.$with("played").as(
    q
      .select({
        user_id: rp.user_id,
        races: sql<number>`count(*)::int`.as("races"),
        wins: sql<number>`(count(*) filter (where ${counted} and ${rp.rank} = 1))::int`.as("wins"),
        week_wpm: sql<number | null>`max(${rp.wpm}) filter (where ${counted})`.as("week_wpm"),
      })
      .from(rp)
      .innerJoin(races, eq(races.id, rp.race_id))
      .where(
        and(
          isNotNull(rp.user_id),
          eq(rp.is_bot, false),
          eq(rp.role, "participant"),
          eq(races.status, "finished"),
          sql`${day} >= ${from}::date`,
          sql`${day} < ${addDays(from, 7)}::date`,
        ),
      )
      .groupBy(rp.user_id),
  );
  const ranked = q.$with("ranked").as(
    q
      .with(played)
      .select({
        pos: sql<number>`(row_number() over (partition by ${users.league}
          order by ${played.wins} desc, ${played.week_wpm} desc nulls last, ${played.user_id}))::int`.as(
          "pos",
        ),
        user_id: users.id,
        display_name: users.display_name,
        avatar_url: users.avatar_url,
        league: users.league,
        wins: played.wins,
        races: played.races,
        week_wpm: played.week_wpm,
      })
      .from(played)
      .innerJoin(users, eq(users.id, played.user_id)),
  );
  const rows = await q
    .with(ranked)
    .select()
    .from(ranked)
    .where(league === null ? undefined : eq(ranked.league, league))
    .orderBy(desc(ranked.league), asc(ranked.pos));
  return rows.map((r) => ({
    position: r.pos,
    userId: r.user_id,
    name: r.display_name,
    avatarUrl: r.avatar_url,
    league: r.league,
    wins: r.wins,
    races: r.races,
    bestWpm: Number(r.week_wpm ?? 0),
  }));
}

// ---- Fin de semaine : prix et changements de classe ----

/**
 * Calcule une seule fois les résultats de la semaine passée (au premier passage après sa fin) : prix de
 * chaque classe, prix du meilleur MPM, montées et descentes. Sûr en cas d'appels simultanés : la ligne de
 * `weekly_settlements` sert de verrou.
 */
export async function settleLastWeek(now = new Date()): Promise<void> {
  const week = previousWeekStart(now);
  const done = await db.query.weeklySettlements.findFirst({
    columns: { week_start: true },
    where: eq(weeklySettlements.week_start, week),
  });
  if (done) return;
  await db.transaction(async (trx) => {
    const [claimed] = await trx
      .insert(weeklySettlements)
      .values({ week_start: week })
      .onConflictDoNothing()
      .returning({ week_start: weeklySettlements.week_start });
    if (!claimed) return; // un autre appel s'en occupe

    const rows = await loadWeek(week, null, trx);
    const activeBy = new Map<number, number>();
    for (const r of rows) activeBy.set(r.league, (activeBy.get(r.league) ?? 0) + 1);

    for (const r of rows) {
      const active = activeBy.get(r.league) ?? 0;
      const prize = r.wins >= MIN_WINS ? leaguePrize(r.league, r.position) : null;
      if (prize) await insertReward(trx, r.userId, week, "wins", r.position, r.league, prize);
      const to = nextLeague(r.league, r.position, active, r.wins);
      await trx
        .insert(leagueHistory)
        .values({
          user_id: r.userId,
          week_start: week,
          from_league: r.league,
          to_league: to,
          position: r.position,
          wins: r.wins,
        })
        .onConflictDoNothing();
      if (to !== r.league) {
        await trx.update(users).set({ league: to }).where(eq(users.id, r.userId));
      }
    }

    const best = [...rows].filter((r) => r.bestWpm > 0).sort((a, b) => b.bestWpm - a.bestWpm)[0];
    if (best) await insertReward(trx, best.userId, week, "wpm", 1, best.league, WPM_PRIZE);
  });
}

async function insertReward(
  trx: Tx,
  userId: string,
  week: string,
  kind: "wins" | "wpm",
  rank: number,
  league: number,
  prize: Prize,
) {
  await trx
    .insert(weeklyRewards)
    .values({
      user_id: userId,
      week_start: week,
      kind,
      rank,
      league,
      xp: prize.xp,
      items: prize.items,
      boost: prize.boost,
    })
    .onConflictDoNothing();
}

/** Champions de la semaine passée (1er de chaque classe) → leur classe, pour la couronne. */
export async function currentChampions(now = new Date()): Promise<Map<string, number>> {
  await settleLastWeek(now);
  const rows = await db
    .select({ user_id: weeklyRewards.user_id, league: weeklyRewards.league })
    .from(weeklyRewards)
    .where(
      and(
        eq(weeklyRewards.week_start, previousWeekStart(now)),
        eq(weeklyRewards.kind, "wins"),
        eq(weeklyRewards.rank, 1),
      ),
    );
  return new Map(rows.map((r) => [r.user_id, r.league]));
}

let championsCache: { at: number; week: string; map: Map<string, number> } | null = null;

/** Comme `currentChampions`, mis en cache une minute (salle et course le demandent souvent). */
export async function championsCached(now = new Date()): Promise<Map<string, number>> {
  const week = previousWeekStart(now);
  if (
    championsCache &&
    championsCache.week === week &&
    now.getTime() - championsCache.at < 60_000
  ) {
    return championsCache.map;
  }
  const map = await currentChampions(now);
  championsCache = { at: now.getTime(), week, map };
  return map;
}

export type LastWeekRow = { kind: "wins" | "wpm"; rank: number; league: number; name: string };

/** Podium de la semaine passée dans chaque classe, et meilleur MPM. */
export async function lastWeekResults(now = new Date()): Promise<LastWeekRow[]> {
  return db
    .select({
      kind: weeklyRewards.kind,
      rank: weeklyRewards.rank,
      league: weeklyRewards.league,
      name: users.display_name,
    })
    .from(weeklyRewards)
    .innerJoin(users, eq(users.id, weeklyRewards.user_id))
    .where(
      and(
        eq(weeklyRewards.week_start, previousWeekStart(now)),
        or(eq(weeklyRewards.kind, "wpm"), lte(weeklyRewards.rank, 3)),
      ),
    )
    .orderBy(desc(weeklyRewards.league), asc(weeklyRewards.rank));
}

/** Dernier changement de classe d'un compte (semaine passée), pour l'annoncer. */
export async function lastMove(userId: string, now = new Date()) {
  const row = await db.query.leagueHistory.findFirst({
    columns: { from_league: true, to_league: true, position: true },
    where: and(
      eq(leagueHistory.user_id, userId),
      eq(leagueHistory.week_start, previousWeekStart(now)),
    ),
  });
  return row ? { from: row.from_league, to: row.to_league, position: row.position } : null;
}

// ---- Récompenses ----

export type Reward = {
  id: string;
  weekStart: string;
  kind: "wins" | "wpm";
  rank: number;
  league: number;
  xp: number;
  items: { item: ItemId; count: number }[];
  boost: number;
};

function parseItems(value: unknown): { item: ItemId; count: number }[] {
  let list = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.flatMap((e: { item?: unknown; count?: unknown }) =>
    isItemId(e?.item) && typeof e.count === "number" ? [{ item: e.item, count: e.count }] : [],
  );
}

export async function pendingRewards(userId: string): Promise<Reward[]> {
  const rows = await db
    .select({
      id: weeklyRewards.id,
      week: weeklyRewards.week_start,
      kind: weeklyRewards.kind,
      rank: weeklyRewards.rank,
      league: weeklyRewards.league,
      xp: weeklyRewards.xp,
      items: weeklyRewards.items,
      boost: weeklyRewards.boost,
    })
    .from(weeklyRewards)
    .where(and(eq(weeklyRewards.user_id, userId), isNull(weeklyRewards.claimed_at)))
    .orderBy(asc(weeklyRewards.week_start));
  return rows.map((r) => ({
    id: r.id,
    weekStart: r.week,
    kind: r.kind,
    rank: r.rank,
    league: r.league,
    xp: r.xp,
    items: parseItems(r.items),
    boost: Number(r.boost),
  }));
}

export class RewardRefusal extends Error {
  constructor(readonly code: "reward_unknown" | "inventory_full") {
    super(code);
  }
}

/**
 * Récupère une récompense : XP, objets dans le sac (refusé si le sac est plein : rien n'est perdu, on fait
 * de la place puis on recommence), bonus d'XP de 7 jours (on garde le plus fort s'il y en a déjà un).
 */
export async function claimReward(userId: string, rewardId: string, now = new Date()) {
  return withInventory(
    userId,
    async (inv, _user, trx) => {
      const [reward] = await trx
        .select({ xp: weeklyRewards.xp, items: weeklyRewards.items, boost: weeklyRewards.boost })
        .from(weeklyRewards)
        .where(
          and(
            eq(weeklyRewards.id, rewardId),
            eq(weeklyRewards.user_id, userId),
            isNull(weeklyRewards.claimed_at),
          ),
        );
      if (!reward) throw new RewardRefusal("reward_unknown");
      for (const { item, count } of parseItems(reward.items)) {
        if (!bagFits(inv, item, count)) throw new RewardRefusal("inventory_full");
        addToBag(inv, newStack(item, count));
      }
      const boost = Number(reward.boost);
      await trx
        .update(users)
        .set({
          xp_total: sql`${users.xp_total} + ${reward.xp}`,
          ...(boost > 0
            ? {
                xp_boost: sql`case when ${users.xp_boost_until} > ${now} then greatest(${users.xp_boost}, ${boost}) else ${boost} end`,
                xp_boost_until: new Date(now.getTime() + BOOST_DAYS * 86_400_000),
              }
            : {}),
        })
        .where(eq(users.id, userId));
      await trx
        .update(weeklyRewards)
        .set({ claimed_at: now })
        .where(eq(weeklyRewards.id, rewardId));
    },
    now,
  );
}

/** Bonus d'XP actif (prix du classement), 0 s'il n'y en a pas. */
export function activeBoost(
  user: { xp_boost: number; xp_boost_until: Date | string | null },
  now = new Date(),
) {
  if (!user.xp_boost_until || new Date(user.xp_boost_until) <= now) return 0;
  return Number(user.xp_boost);
}
