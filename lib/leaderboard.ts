// Classement et classes (fonctionnalité ajoutée, règles validées par l'étudiant le 16 oct. 2026).
// - Classement général : niveau, meilleur MPM, courses gagnées (temps réel).
// - Classes : bronze, argent, or, diamant, netherite. Chaque semaine (lundi 0 h → dimanche 23 h 59, heure
//   de Toronto), chacun est classé contre sa classe par courses gagnées ; les premiers montent, les
//   derniers descendent, et il y a des prix par classe.
// Les résultats d'une semaine sont calculés une seule fois, au premier passage après sa fin (pas de tâche
// de fond), puis chaque gagnant récupère son prix (bouton RÉCUPÉRER : rien n'est perdu si le sac est plein).
// Une victoire = 1re place d'une course finie avec au moins un adversaire (un bot compte).
// Sans dépendance à Next.js : aussi utilisé par le serveur temps réel (couronnes).
import { sql, type Transaction } from "kysely";
import type { Database } from "@/db/types";
import { db } from "@/lib/db";
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

type Q = Transaction<Database> | typeof db;

/** Une course compte si elle a au moins deux participants (un bot compte). */
const HAS_OPPONENT = sql`(select count(*) from race_participants o
                          where o.race_id = rp.race_id and o.role = 'participant') >= 2`;

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

const ORDER: Record<Board, ReturnType<typeof sql>> = {
  level: sql`s.xp_total desc, s.best_wpm desc, s.id`,
  wpm: sql`s.best_wpm desc, s.xp_total desc, s.id`,
  wins: sql`s.wins desc, s.best_wpm desc, s.id`,
};
const FILTER: Record<Board, ReturnType<typeof sql>> = {
  level: sql`s.xp_total > 0`,
  wpm: sql`s.best_wpm > 0`,
  wins: sql`s.wins > 0`,
};

/** Classement général : top 50, plus la ligne de `me` s'il est plus loin. */
export async function loadBoard(board: Board, me: string | null, q: Q = db): Promise<BoardRow[]> {
  const { rows } = await sql<{
    pos: number;
    id: string;
    display_name: string;
    avatar_url: string | null;
    league: number;
    xp_total: number;
    best_wpm: number;
    wins: number;
  }>`
    with w as (
      select rp.user_id, count(*)::int as wins
        from race_participants rp
       where rp.user_id is not null and rp.is_bot = false and rp.role = 'participant'
         and rp.status = 'finished' and rp.rank = 1 and ${HAS_OPPONENT}
       group by rp.user_id
    ),
    s as (
      select u.id, u.display_name, u.avatar_url, u.league, u.xp_total, u.best_wpm,
             coalesce(w.wins, 0) as wins
        from users u left join w on w.user_id = u.id
    ),
    ranked as (
      select s.*, row_number() over (order by ${ORDER[board]})::int as pos from s where ${FILTER[board]}
    )
    select * from ranked where pos <= ${BOARD_SIZE} or id = ${me}
    order by pos`.execute(q);
  return rows.map((r) => ({
    position: r.pos,
    userId: r.id,
    name: r.display_name,
    avatarUrl: r.avatar_url,
    league: r.league,
    xp: r.xp_total,
    bestWpm: Number(r.best_wpm),
    wins: r.wins,
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
  const { rows } = await sql<{
    pos: number;
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    league: number;
    wins: number;
    races: number;
    week_wpm: number | null;
  }>`
    with played as (
      select rp.user_id,
             count(*)::int as races,
             (count(*) filter (where rp.status = 'finished' and rp.rank = 1 and ${HAS_OPPONENT}))::int as wins,
             max(rp.wpm) filter (where rp.status = 'finished' and ${HAS_OPPONENT}) as week_wpm
        from race_participants rp join races r on r.id = rp.race_id
       where rp.user_id is not null and rp.is_bot = false and rp.role = 'participant'
         and r.status = 'finished'
         and (coalesce(rp.finished_at, r.ends_at, r.created_at) at time zone 'America/Toronto')::date
             >= ${from}::date
         and (coalesce(rp.finished_at, r.ends_at, r.created_at) at time zone 'America/Toronto')::date
             < ${addDays(from, 7)}::date
       group by rp.user_id
    ),
    ranked as (
      select row_number() over (partition by u.league
                                order by p.wins desc, p.week_wpm desc nulls last, p.user_id)::int as pos,
             p.user_id, u.display_name, u.avatar_url, u.league, p.wins, p.races, p.week_wpm
        from played p join users u on u.id = p.user_id
    )
    select * from ranked
     where ${league === null ? sql`true` : sql`league = ${league}`}
     order by league desc, pos`.execute(q);
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
  const done = await db
    .selectFrom("weekly_settlements")
    .select("week_start")
    .where("week_start", "=", week)
    .executeTakeFirst();
  if (done) return;
  await db.transaction().execute(async (trx) => {
    const claimed = await trx
      .insertInto("weekly_settlements")
      .values({ week_start: week })
      .onConflict((oc) => oc.doNothing())
      .returning("week_start")
      .executeTakeFirst();
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
        .insertInto("league_history")
        .values({
          user_id: r.userId,
          week_start: week,
          from_league: r.league,
          to_league: to,
          position: r.position,
          wins: r.wins,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
      if (to !== r.league) {
        await trx.updateTable("users").set({ league: to }).where("id", "=", r.userId).execute();
      }
    }

    const best = [...rows].filter((r) => r.bestWpm > 0).sort((a, b) => b.bestWpm - a.bestWpm)[0];
    if (best) await insertReward(trx, best.userId, week, "wpm", 1, best.league, WPM_PRIZE);
  });
}

async function insertReward(
  trx: Transaction<Database>,
  userId: string,
  week: string,
  kind: "wins" | "wpm",
  rank: number,
  league: number,
  prize: Prize,
) {
  await trx
    .insertInto("weekly_rewards")
    .values({
      user_id: userId,
      week_start: week,
      kind,
      rank,
      league,
      xp: prize.xp,
      items: JSON.stringify(prize.items),
      boost: prize.boost,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
}

/** Champions de la semaine passée (1er de chaque classe) → leur classe, pour la couronne. */
export async function currentChampions(now = new Date()): Promise<Map<string, number>> {
  await settleLastWeek(now);
  const rows = await db
    .selectFrom("weekly_rewards")
    .select(["user_id", "league"])
    .where("week_start", "=", previousWeekStart(now))
    .where("kind", "=", "wins")
    .where("rank", "=", 1)
    .execute();
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
  const rows = await db
    .selectFrom("weekly_rewards")
    .innerJoin("users", "users.id", "weekly_rewards.user_id")
    .select([
      "weekly_rewards.kind",
      "weekly_rewards.rank",
      "weekly_rewards.league",
      "users.display_name as name",
    ])
    .where("weekly_rewards.week_start", "=", previousWeekStart(now))
    .where((eb) =>
      eb.or([eb("weekly_rewards.kind", "=", "wpm"), eb("weekly_rewards.rank", "<=", 3)]),
    )
    .orderBy("weekly_rewards.league", "desc")
    .orderBy("weekly_rewards.rank")
    .execute();
  return rows;
}

/** Dernier changement de classe d'un compte (semaine passée), pour l'annoncer. */
export async function lastMove(userId: string, now = new Date()) {
  const row = await db
    .selectFrom("league_history")
    .select(["from_league", "to_league", "position"])
    .where("user_id", "=", userId)
    .where("week_start", "=", previousWeekStart(now))
    .executeTakeFirst();
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
    .selectFrom("weekly_rewards")
    .select([
      "id",
      sql<string>`week_start::text`.as("week"),
      "kind",
      "rank",
      "league",
      "xp",
      "items",
      "boost",
    ])
    .where("user_id", "=", userId)
    .where("claimed_at", "is", null)
    .orderBy("week_start")
    .execute();
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
      const reward = await trx
        .selectFrom("weekly_rewards")
        .select(["xp", "items", "boost"])
        .where("id", "=", rewardId)
        .where("user_id", "=", userId)
        .where("claimed_at", "is", null)
        .executeTakeFirst();
      if (!reward) throw new RewardRefusal("reward_unknown");
      for (const { item, count } of parseItems(reward.items)) {
        if (!bagFits(inv, item, count)) throw new RewardRefusal("inventory_full");
        addToBag(inv, newStack(item, count));
      }
      const boost = Number(reward.boost);
      await trx
        .updateTable("users")
        .set({
          xp_total: sql<number>`xp_total + ${reward.xp}`,
          ...(boost > 0
            ? {
                xp_boost: sql<number>`case when xp_boost_until > ${now} then greatest(xp_boost, ${boost}) else ${boost} end`,
                xp_boost_until: new Date(now.getTime() + BOOST_DAYS * 86_400_000),
              }
            : {}),
        })
        .where("id", "=", userId)
        .execute();
      await trx
        .updateTable("weekly_rewards")
        .set({ claimed_at: now })
        .where("id", "=", rewardId)
        .execute();
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
