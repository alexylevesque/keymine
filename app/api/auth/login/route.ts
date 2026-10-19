import { NextResponse } from "next/server";
import { z } from "zod";
import { kysely as db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { mergeGuestHistory } from "@/lib/stats";
import { readGuestId } from "@/lib/auth/guest";
import { msg } from "@/lib/api-messages";

const schema = z.object({
  username: z.string().trim().min(1).max(20),
  password: z.string().min(1).max(72),
  rememberMe: z.boolean().optional().default(true),
});

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// AUTH-9: limite de tentatives contre la force brute.
export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: await msg("bad_request") }, { status: 400 });
  }
  const { username, password, rememberMe } = body.data;

  const user = await db
    .selectFrom("users")
    .select([
      "id",
      "username",
      "display_name",
      "password_hash",
      "failed_login_attempts",
      "locked_until",
    ])
    .where("username", "=", username)
    .executeTakeFirst();

  // Message générique volontairement identique (pas d'énumération de comptes).
  const invalid = async () =>
    NextResponse.json({ error: await msg("bad_credentials") }, { status: 401 });

  if (!user) return invalid();

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return NextResponse.json(
      { error: await msg("login_locked") },
      { status: 429 },
    );
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    await db
      .updateTable("users")
      .set({
        failed_login_attempts: attempts,
        locked_until:
          attempts >= MAX_ATTEMPTS
            ? new Date(Date.now() + LOCK_MINUTES * 60_000)
            : user.locked_until,
      })
      .where("id", "=", user.id)
      .execute();
    return invalid();
  }

  await db
    .updateTable("users")
    .set({ failed_login_attempts: 0, locked_until: null })
    .where("id", "=", user.id)
    .execute();

  await createSession({ userId: user.id, username: user.username }, rememberMe);

  const guestId = await readGuestId();
  if (guestId) {
    await mergeGuestHistory(guestId, user.id);
  }

  return NextResponse.json({ user: { username: user.username, displayName: user.display_name } });
}
