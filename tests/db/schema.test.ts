// TECH-04 : le schéma Drizzle (db/schema.ts) doit décrire exactement la base
// produite par les migrations SQL : mêmes tables, mêmes colonnes, même
// nullabilité. Un oubli dans l'un ou l'autre fait échouer ce test.
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

const client = new Client({ connectionString: process.env.DATABASE_URL });

beforeAll(async () => {
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

const tables: PgTable[] = Object.values(schema).filter((value) => is(value, PgTable));

async function databaseColumns(): Promise<Map<string, Map<string, boolean>>> {
  const { rows } = await client.query<{
    table_name: string;
    column_name: string;
    is_nullable: string;
  }>(
    `select table_name, column_name, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name <> '_migrations'`,
  );
  const result = new Map<string, Map<string, boolean>>();
  for (const row of rows) {
    const columns = result.get(row.table_name) ?? new Map<string, boolean>();
    columns.set(row.column_name, row.is_nullable === "NO");
    result.set(row.table_name, columns);
  }
  return result;
}

describe("schéma Drizzle", () => {
  it("décrit toutes les tables de la base migrée", async () => {
    const inDb = [...(await databaseColumns()).keys()].sort();
    const inSchema = tables.map((table) => getTableConfig(table).name).sort();
    expect(inSchema).toEqual(inDb);
  });

  it("a les mêmes colonnes et la même nullabilité que la base", async () => {
    const inDb = await databaseColumns();
    for (const table of tables) {
      const config = getTableConfig(table);
      const expected = Object.fromEntries(inDb.get(config.name) ?? []);
      const actual = Object.fromEntries(
        config.columns.map((column) => [column.name, column.notNull]),
      );
      expect({ table: config.name, columns: actual }).toEqual({
        table: config.name,
        columns: expected,
      });
    }
  });
});
