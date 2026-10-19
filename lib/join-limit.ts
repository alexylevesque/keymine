import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { joinAttempts } from "@/db/schema";

// SALLE-10 : le code de salle est protégé contre la force brute. On compte les
// tentatives *échouées* (code inconnu, salle privée sans invitation, lien
// invalide) par adresse IP : 10 par minute. Les entrées réussies ne comptent pas,
// pour qu'une classe derrière une même adresse puisse rejoindre normalement.
export const JOIN_ATTEMPT_LIMIT = 10;
export const JOIN_ATTEMPT_WINDOW_MS = 60_000;

export async function isJoinRateLimited(ip: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - JOIN_ATTEMPT_WINDOW_MS);
  const attempts = await db.$count(
    joinAttempts,
    and(eq(joinAttempts.ip, ip), gt(joinAttempts.attempted_at, since)),
  );
  return attempts >= JOIN_ATTEMPT_LIMIT;
}

export async function recordFailedJoin(ip: string, now = new Date()): Promise<void> {
  await db.insert(joinAttempts).values({ ip });
  // Ménage opportuniste : plus rien à garder au-delà de dix minutes.
  await db
    .delete(joinAttempts)
    .where(lt(joinAttempts.attempted_at, new Date(now.getTime() - 10 * JOIN_ATTEMPT_WINDOW_MS)));
}
