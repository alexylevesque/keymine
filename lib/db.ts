import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database } from "@/db/types";
import * as schema from "@/db/schema";

export type Db = NodePgDatabase<typeof schema>;
/** Transaction Drizzle (même interface que `db`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

declare global {
  var __keyminePool: Pool | undefined;
  var __keymineDb: Db | undefined;
  var __keymineKysely: Kysely<Database> | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL manquant. Copie .env.example vers .env et démarre Postgres (bun run db:dev).",
    );
  }
  return new Pool({ connectionString, max: 10 });
}

// En dev, Next.js recharge les modules à chaud: on garde une seule instance
// du pool de connexions sur `globalThis` pour ne pas en ouvrir un nouveau à
// chaque rechargement.
const pool = globalThis.__keyminePool ?? createPool();

/** Accès aux données par l'ORM Drizzle (TECH-04). */
export const db: Db = globalThis.__keymineDb ?? drizzle({ client: pool, schema });

/** Ancien accès Kysely, retiré au fur et à mesure de la migration vers Drizzle. */
export const kysely: Kysely<Database> =
  globalThis.__keymineKysely ?? new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

if (process.env.NODE_ENV !== "production") {
  globalThis.__keyminePool = pool;
  globalThis.__keymineDb = db;
  globalThis.__keymineKysely = kysely;
}
