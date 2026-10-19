import { NextResponse } from "next/server";
import { z } from "zod";
import { getIdentity } from "@/lib/auth/identity";
import { guestPseudoSchema } from "@/lib/auth/pseudo";
import { kysely as db } from "@/lib/db";
import { msg, zodMessage } from "@/lib/api-messages";

const schema = z.object({ displayName: guestPseudoSchema });

// AUTH-05 : un utilisateur connecté modifie son pseudonyme d'affichage (3 à 20 caractères).
export async function PATCH(request: Request) {
  const identity = await getIdentity();
  if (!identity || identity.kind !== "user") {
    return NextResponse.json({ error: await msg("login_required"), code: "account_required" }, { status: 401 });
  }
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: await zodMessage(body.error, "bad_pseudo") }, { status: 400 });
  }
  await db.updateTable("users").set({ display_name: body.data.displayName }).where("id", "=", identity.userId).execute();
  return NextResponse.json({ ok: true, displayName: body.data.displayName });
}
