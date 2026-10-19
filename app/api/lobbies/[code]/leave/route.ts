import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbyPlayers } from "@/db/schema";
import { getIdentity } from "@/lib/auth/identity";
import { getLobbyByCode, isPlayer } from "@/lib/lobby";
import { msg } from "@/lib/api-messages";

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json(
      { error: await msg("pseudo_required"), code: "pseudo_required" },
      { status: 401 },
    );
  }
  await db.delete(lobbyPlayers).where(and(eq(lobbyPlayers.lobby_id, lobby.id), isPlayer(identity)));

  return NextResponse.json({ ok: true });
}
