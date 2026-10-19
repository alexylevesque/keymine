import { NextResponse } from "next/server";
import { z } from "zod";
import { kysely as db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { mergeGuestHistory } from "@/lib/stats";
import { readGuestId } from "@/lib/auth/guest";
import { msg, zodMessage } from "@/lib/api-messages";

// AUTH-1/AUTH-2: nom d'utilisateur + mot de passe, aucun courriel.
const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "pseudo_min")
    .max(20, "pseudo_max")
    .regex(/^[a-zA-Z0-9_-]+$/, "Lettres, chiffres, _ et - seulement"),
  password: z.string().min(6, "password_min").max(72, "password_max"),
  rememberMe: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: await zodMessage(body.error, "bad_request") }, { status: 400 });
  }

  const { username, password, rememberMe } = body.data;

  const existing = await db
    .selectFrom("users")
    .select("id")
    .where("username", "=", username)
    .executeTakeFirst();
  if (existing) {
    return NextResponse.json({ error: await msg("username_taken") }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await db
    .insertInto("users")
    .values({ username, password_hash: passwordHash, display_name: username })
    .returning(["id", "username", "display_name"])
    .executeTakeFirstOrThrow();

  await createSession({ userId: user.id, username: user.username }, rememberMe);

  const guestId = await readGuestId();
  if (guestId) {
    await mergeGuestHistory(guestId, user.id);
  }

  return NextResponse.json({ user: { username: user.username, displayName: user.display_name } });
}
