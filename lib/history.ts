import { sql } from "kysely";
import { z } from "zod";
import { kysely as db } from "@/lib/db";
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
  return { section: q.section, sort: q.section === "spectated" ? "date" : q.sort, dir: q.dir, page: q.page };
}

function baseFor(userId: string, section: HistorySection) {
  const base = db
    .selectFrom("race_participants")
    .innerJoin("races", "races.id", "race_participants.race_id")
    .where("race_participants.user_id", "=", userId)
    .where("race_participants.hidden_from_history", "=", false)
    .where("races.status", "=", "finished");
  if (section === "all") return base;
  if (section === "spectated") return base.where("race_participants.role", "=", "spectator");
  const played = base.where("race_participants.role", "=", "participant");
  return section === "abandoned"
    ? played.where("race_participants.status", "=", "abandoned")
    : played.where("race_participants.status", "<>", "abandoned");
}

async function countFor(userId: string, section: HistorySection): Promise<number> {
  const row = await baseFor(userId, section)
    .select((eb) => eb.fn.countAll<string>().as("total"))
    .executeTakeFirstOrThrow();
  return Number(row.total);
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

  let select = baseFor(userId, section)
    .innerJoin("lobbies", "lobbies.id", "races.lobby_id")
    .select([
      "races.id as race_id",
      "lobbies.code as lobby_code",
      "races.created_at as played_at",
      "race_participants.rank",
      "race_participants.wpm",
      "race_participants.accuracy",
      "race_participants.status",
      "race_participants.role",
      (eb) =>
        eb
          .selectFrom("race_participants as rp")
          .select((e) => e.fn.countAll<string>().as("n"))
          .whereRef("rp.race_id", "=", "races.id")
          .where("rp.role", "=", "participant")
          .as("participant_count"),
      (eb) =>
        eb
          .selectFrom("race_participants as w")
          .select("w.display_name")
          .whereRef("w.race_id", "=", "races.id")
          .where("w.role", "=", "participant")
          .where("w.rank", "=", 1)
          .limit(1)
          .as("winner_name"),
      (eb) =>
        eb
          .selectFrom("race_participants as w")
          .select("w.wpm")
          .whereRef("w.race_id", "=", "races.id")
          .where("w.role", "=", "participant")
          .where("w.rank", "=", 1)
          .limit(1)
          .as("winner_wpm"),
    ]);

  // Tri demandé, puis la date en départage (toujours la plus récente d'abord) pour un ordre stable.
  if (sort === "wpm")
    select = select.orderBy(sql`race_participants.wpm ${sql.raw(dir)} nulls last`);
  else if (sort === "rank")
    select = select.orderBy(sql`race_participants.rank ${sql.raw(dir)} nulls last`);
  else select = select.orderBy(sql`races.created_at ${sql.raw(dir)}`);
  if (sort !== "date") select = select.orderBy("races.created_at", "desc");

  const rows = await select
    .limit(HISTORY_PAGE_SIZE)
    .offset((page - 1) * HISTORY_PAGE_SIZE)
    .execute();

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
    .updateTable("race_participants")
    .set({ hidden_from_history: true })
    .where("user_id", "=", userId)
    .where("race_id", "=", raceId)
    .where("hidden_from_history", "=", false)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}
