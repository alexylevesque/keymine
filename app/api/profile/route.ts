import { NextResponse } from "next/server";
import { z } from "zod";
import { getIdentity } from "@/lib/auth/identity";
import { guestPseudoSchema } from "@/lib/auth/pseudo";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { msg, zodMessage } from "@/lib/api-messages";

const schema = z.object({ displayName: guestPseudoSchema });

// AUTH-05 : un utilisateur connecté modifie son pseudonyme d'affichage (3 à 20 caractères).
export async function PATCH(request: Request) {
  const identity = await getIdentity();
  if (!identity || identity.kind !== "user") {
    return NextResponse.json(
      { error: await msg("login_required"), code: "account_required" },
      { status: 401 },
    );
  }
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: await zodMessage(body.error, "bad_pseudo") },
      { status: 400 },
    );
  }
  await db
    .update(users)
    .set({ display_name: body.data.displayName })
    .where(eq(users.id, identity.userId));
  return NextResponse.json({ ok: true, displayName: body.data.displayName });
}
