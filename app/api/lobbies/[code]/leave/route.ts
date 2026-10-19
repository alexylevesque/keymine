import { NextResponse } from "next/server";
import { kysely as db } from "@/lib/db";
import { getIdentity } from "@/lib/auth/identity";
import { getLobbyByCode } from "@/lib/lobby";
import { msg } from "@/lib/api-messages";

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json({ error: await msg("pseudo_required"), code: "pseudo_required" }, { status: 401 });
  }
  await db
    .deleteFrom("lobby_players")
    .where("lobby_id", "=", lobby.id)
    .where((eb) =>
      identity.kind === "user"
        ? eb("user_id", "=", identity.userId)
        : eb("guest_id", "=", identity.guestId),
    )
    .execute();

  return NextResponse.json({ ok: true });
}
