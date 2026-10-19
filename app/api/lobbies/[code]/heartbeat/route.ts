import { NextResponse } from "next/server";
import { kysely as db } from "@/lib/db";
import { getIdentity } from "@/lib/auth/identity";
import { getLobbyByCode, isHost } from "@/lib/lobby";
import { msg } from "@/lib/api-messages";

// COUR-13/COUR-15: présence du joueur (reconnexion) et de l'hôte (transfert
// après inactivité), rafraîchies par un ping régulier du client.
export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json({ error: await msg("pseudo_required"), code: "pseudo_required" }, { status: 401 });
  }

  await db
    .updateTable("lobby_players")
    .set({ last_seen_at: new Date() })
    .where("lobby_id", "=", lobby.id)
    .where((eb) =>
      identity.kind === "user"
        ? eb("user_id", "=", identity.userId)
        : eb("guest_id", "=", identity.guestId),
    )
    .execute();

  if (isHost(identity, lobby)) {
    await db
      .updateTable("lobbies")
      .set({ last_host_seen_at: new Date() })
      .where("id", "=", lobby.id)
      .execute();
  }

  return NextResponse.json({ ok: true });
}
