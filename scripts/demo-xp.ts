// Outil de démonstration (développement local seulement) : ajoute de l'XP à un compte.
// Usage : bun run demo:xp [nom_utilisateur] [xp]   (alice et 1000 par défaut ; un nombre négatif en retire)
// Refuse de toucher une base qui n'est pas sur cet ordinateur.
import { eq, sql } from "drizzle-orm";
import { users } from "@/db/schema";
import { localDemoDb } from "./demo-db";

const username = process.argv[2] ?? "alice";
const amount = Math.trunc(Number(process.argv[3] ?? 1000));
if (!Number.isFinite(amount)) {
  console.error("[demo] le nombre d'XP n'est pas valide.");
  process.exit(1);
}

const { db, closeDb } = await localDemoDb();
const [row] = await db
  .update(users)
  .set({ xp_total: sql`greatest(0, ${users.xp_total} + ${amount})` })
  .where(eq(users.username, username))
  .returning({ xp_total: users.xp_total });
await closeDb();
if (!row) {
  console.error(`[demo] compte « ${username} » introuvable.`);
  process.exit(1);
}
console.log(`[demo] ${username} : ${amount >= 0 ? "+" : ""}${amount} XP (total ${row.xp_total}).`);
