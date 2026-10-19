import { and, asc, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/lib/db";
import { lobbies, raceParticipants, races } from "@/db/schema";
import type { ParticipantStatus } from "@/db/types";
import {
  HISTORY_SECTIONS,
  HISTORY_SORTS,
  type HistoryDirection,
  type HistorySection,
  type HistorySort,
} from "@/lib/history-config";

export { HISTORY_SECTIONS, HISTORY_SORTS };
export type { HistoryDirection, HistorySection, HistorySort };

// HIST-01 : historique paginé des courses terminées d'un compte, en quatre sections :
// toutes les courses, celles jouées, celles regardées en spectateur et les abandons.
// Les courses non terminées (en cours, ou interrompues sans résultat) n'y figurent pas.

export const HISTORY_PAGE_SIZE = 10;

export type HistoryQuery = {
  section: HistorySection;
  sort: HistorySort;
  dir: HistoryDirection;
  page: number;
};

export type HistoryRow = {
  raceId: string;
  lobbyCode: string;
  playedAt: Date;
  rank: number | null;
  participantCount: number;
  wpm: number;
  accuracy: number;
  status: ParticipantStatus;
  /** Rôle du compte dans cette course : joueur ou spectateur. */
  role: "participant" | "spectator";
  /** Section « spectateur » : le vainqueur de la course regardée. */
  winnerName: string | null;
  winnerWpm: number | null;
};

export type HistoryCounts = Record<HistorySection, number>;

export type HistoryPage = HistoryQuery & {
  rows: HistoryRow[];
  pages: number;
  total: number;
  counts: HistoryCounts;
};

type RawParam = string | string[] | undefined;

/** Numéro de page demandé (query string) ramené à un entier ≥ 1. */
export function parsePage(value: RawParam): number {
  return historyQuerySchema.shape.page.parse(value);
}

// Paramètres d'URL de l'historique validés par Zod (TECH-07) : toute valeur inconnue retombe sur la
// valeur par défaut au lieu de provoquer une erreur.
const queryValue = z.preprocess((v) => (Array.isArray(v) ? v[0] : v), z.string().optional());
const historyQuerySchema = z.object({
  section: queryValue.pipe(z.enum(HISTORY_SECTIONS)).catch("all"),
  sort: queryValue.pipe(z.enum(HISTORY_SORTS)).catch("date"),
  dir: queryValue.pipe(z.enum(["asc", "desc"])).catch("desc"),
  page: queryValue
    .pipe(z.string().regex(/^\d+$/).transform(Number))
    .pipe(z.number().int().min(1))
    .transform((n) => Math.min(n, 100_000))
    .catch(1),
});

/** Paramètres d'URL de l'historique : toute valeur inconnue retombe sur la valeur par défaut. */
export function parseHistoryQuery(query: Record<string, RawParam>): HistoryQuery {
  const q = historyQuerySchema.parse(query);
  // La section « spectateur » n'a pas de MPM ni de rang personnels : seul le tri par date a un sens.
  return {
    section: q.section,
    sort: q.section === "spectated" ? "date" : q.sort,
    dir: q.dir,
    page: q.page,
  };
}

const rp = raceParticipants;

/** Lignes de l'historique d'un compte pour une section (à appliquer sur race_participants ⋈ races). */
function sectionFilter(userId: string, section: HistorySection): SQL | undefined {
  const base = [
    eq(rp.user_id, userId),
    eq(rp.hidden_from_history, false),
    eq(races.status, "finished"),
  ];
  if (section === "all") return and(...base);
  if (section === "spectated") return and(...base, eq(rp.role, "spectator"));
  return and(
    ...base,
    eq(rp.role, "participant"),
    section === "abandoned" ? eq(rp.status, "abandoned") : ne(rp.status, "abandoned"),
  );
}

async function countFor(userId: string, section: HistorySection): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(rp)
    .innerJoin(races, eq(races.id, rp.race_id))
    .where(sectionFilter(userId, section));
  return row?.total ?? 0;
}

export async function loadHistory(
  userId: string,
  query: Partial<HistoryQuery> & { page: number } = { page: 1 },
): Promise<HistoryPage> {
  const section = query.section ?? "all";
  const sort = section === "spectated" ? "date" : (query.sort ?? "date");
  const dir = query.dir ?? "desc";

  const counts: HistoryCounts = {
    all: await countFor(userId, "all"),
    played: await countFor(userId, "played"),
    abandoned: await countFor(userId, "abandoned"),
    spectated: await countFor(userId, "spectated"),
  };
  const total = counts[section];
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), pages);

  // Le vainqueur de la course (section « spectateur ») et le nombre de participants.
  const other = alias(raceParticipants, "other");
  const winner = alias(raceParticipants, "winner");
  const winnerOf = and(
    eq(winner.race_id, races.id),
    eq(winner.role, "participant"),
    eq(winner.rank, 1),
  );
  const participantCount = db
    .select({ n: sql<number>`count(*)::int` })
    .from(other)
    .where(and(eq(other.race_id, races.id), eq(other.role, "participant")));
  const winnerName = db.select({ name: winner.display_name }).from(winner).where(winnerOf).limit(1);
  const winnerWpm = db.select({ wpm: winner.wpm }).from(winner).where(winnerOf).limit(1);

  // Tri demandé, puis la date en départage (toujours la plus récente d'abord) pour un ordre stable.
  const by = dir === "asc" ? asc : desc;
  const order =
    sort === "wpm"
      ? [sql`${by(rp.wpm)} nulls last`, desc(races.created_at)]
      : sort === "rank"
        ? [sql`${by(rp.rank)} nulls last`, desc(races.created_at)]
        : [by(races.created_at)];

  const rows = await db
    .select({
      race_id: races.id,
      lobby_code: lobbies.code,
      played_at: races.created_at,
      rank: rp.rank,
      wpm: rp.wpm,
      accuracy: rp.accuracy,
      status: rp.status,
      role: rp.role,
      participant_count: sql<number>`(${participantCount})`,
      winner_name: sql<string | null>`(${winnerName})`,
      winner_wpm: sql<number | null>`(${winnerWpm})`,
    })
    .from(rp)
    .innerJoin(races, eq(races.id, rp.race_id))
    .innerJoin(lobbies, eq(lobbies.id, races.lobby_id))
    .where(sectionFilter(userId, section))
    .orderBy(...order)
    .limit(HISTORY_PAGE_SIZE)
    .offset((page - 1) * HISTORY_PAGE_SIZE);

  return {
    section,
    sort,
    dir,
    page,
    pages,
    total,
    counts,
    rows: rows.map((r) => ({
      raceId: r.race_id,
      lobbyCode: r.lobby_code,
      playedAt: new Date(r.played_at),
      rank: r.rank,
      participantCount: Number(r.participant_count ?? 0),
      wpm: r.wpm ?? 0,
      accuracy: r.accuracy ?? 100,
      status: r.status,
      role: r.role,
      winnerName: r.winner_name ?? null,
      winnerWpm: r.winner_wpm ?? null,
    })),
  };
}

/** Retire une course de l'historique du compte (toutes ses lignes : joueur ou spectateur). Renvoie vrai si quelque chose a été masqué. */
export async function hideFromHistory(userId: string, raceId: string): Promise<boolean> {
  const result = await db
    .update(raceParticipants)
    .set({ hidden_from_history: true })
    .where(
      and(
        eq(raceParticipants.user_id, userId),
        eq(raceParticipants.race_id, raceId),
        eq(raceParticipants.hidden_from_history, false),
      ),
    );
  return (result.rowCount ?? 0) > 0;
}
