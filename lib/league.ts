// Classes, semaines et prix du classement (fonctionnalité ajoutée, règles validées par l'étudiant le
// 16 oct. 2026). Logique pure, testée ; les requêtes sont dans lib/leaderboard.ts.
import type { ItemId } from "@/lib/items";
import { nextShopReset, shopDay } from "@/lib/shop";

// ---- Semaines ----

const WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" });
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** Lundi (AAAA-MM-JJ) de la semaine de `now`, heure de Toronto. */
export function weekStart(now: Date): string {
  const offset = DAYS.indexOf(WEEKDAY.format(now));
  return addDays(shopDay(now), -Math.max(0, offset));
}

export function previousWeekStart(now: Date): string {
  return addDays(weekStart(now), -7);
}

/** Fin de la semaine en cours : lundi suivant à minuit, heure de Toronto (changements d'heure compris). */
export function weekEnd(now: Date): Date {
  const target = addDays(weekStart(now), 7);
  let t = now;
  for (let i = 0; i < 8 && shopDay(t) !== target; i++) t = nextShopReset(t);
  return t;
}

// ---- Classes et prix ----

export const LEAGUES = ["bronze", "silver", "gold", "diamond", "netherite"] as const;
export type League = (typeof LEAGUES)[number];
export const TOP_LEAGUE = LEAGUES.length - 1;

/** Victoires minimales dans la semaine pour un prix ou pour monter. */
export const MIN_WINS = 3;
export const PRIZED_PLACES = 10;
export const BOOST_DAYS = 7;

export type Prize = { xp: number; items: { item: ItemId; count: number }[]; boost: number };

const P = (xp: number, item: ItemId, count: number, boost: number): Prize => ({
  xp,
  items: [{ item, count }],
  boost,
});

/** Prix du 1er, 2e et 3e de chaque classe (bonus d'XP de 7 jours : +15, +10, +7 %). */
export const LEAGUE_PRIZES: readonly (readonly [Prize, Prize, Prize])[] = [
  [P(150, "iron_ingot", 4, 0.15), P(100, "iron_ingot", 2, 0.1), P(50, "iron_ingot", 1, 0.07)],
  [P(250, "gold_ingot", 3, 0.15), P(150, "gold_ingot", 2, 0.1), P(80, "gold_ingot", 1, 0.07)],
  [P(350, "diamond", 2, 0.15), P(200, "diamond", 1, 0.1), P(120, "gold_ingot", 2, 0.07)],
  [P(500, "netherite_ingot", 1, 0.15), P(300, "diamond", 1, 0.1), P(150, "gold_ingot", 2, 0.07)],
  [
    P(800, "netherite_ingot", 2, 0.15),
    P(500, "netherite_ingot", 1, 0.1),
    P(250, "diamond", 2, 0.07),
  ],
];
/** Bonus d'XP des places 4 à 10, selon la classe. */
export const LEAGUE_OTHER_BOOST = [0.03, 0.04, 0.05, 0.05, 0.07] as const;

/** Prix du meilleur MPM de la semaine, pour tout le serveur. */
export const WPM_PRIZE: Prize = P(100, "totem", 1, 0);

export function leaguePrize(league: number, position: number): Prize | null {
  if (position < 1 || position > PRIZED_PLACES) return null;
  const top = LEAGUE_PRIZES[league]?.[position - 1];
  if (top) return top;
  return { xp: 0, items: [], boost: LEAGUE_OTHER_BOOST[league] ?? 0 };
}

/** Combien montent et descendent, selon le nombre de joueurs actifs de la classe. */
export function leagueMoves(active: number): { up: number; down: number } {
  if (active >= 8) return { up: 3, down: 3 };
  if (active >= 5) return { up: 2, down: 1 };
  if (active >= 2) return { up: 1, down: 0 };
  return { up: 0, down: 0 };
}

/** Nouvelle classe d'un joueur actif selon sa place (1 = premier) parmi `active` joueurs. */
export function nextLeague(league: number, position: number, active: number, wins: number): number {
  const { up, down } = leagueMoves(active);
  if (position <= up && wins >= MIN_WINS) return Math.min(TOP_LEAGUE, league + 1);
  if (down > 0 && position > active - down && position > up) return Math.max(0, league - 1);
  return league;
}
