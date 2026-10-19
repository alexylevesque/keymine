import { NextResponse } from "next/server";
import { sql } from "kysely";
import { kysely as db } from "@/lib/db";
import { getIdentity } from "@/lib/auth/identity";
import { joinLobby } from "@/lib/lobby";
import { msg } from "@/lib/api-messages";

// JOIN-03: « Faire une course ». Parmi les salles publiques joignables et non
// pleines, on choisit celle qui est la plus proche de sa capacité maximale
// (le moins de places libres); à égalité, la plus ancienne l'emporte.
// S'il n'y en a aucune, on le dit : un compte se voit proposer de créer une
// salle publique par défaut, un invité voit simplement un état vide.
export async function POST() {
  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json({ error: await msg("pseudo_required"), code: "pseudo_required" }, { status: 401 });
  }

  const candidates = await db
    .selectFrom("lobbies")
    .select([
      "lobbies.id",
      "lobbies.code",
      "lobbies.max_players",
      sql<number>`(select count(*) from lobby_players lp
                   where lp.lobby_id = lobbies.id and lp.role = 'participant' and lp.active)`.as(
        "participants",
      ),
    ])
    .where("lobbies.status", "=", "lobby")
    .where("lobbies.access", "=", "public")
    .orderBy(sql`lobbies.max_players - (select count(*) from lobby_players lp
                   where lp.lobby_id = lobbies.id and lp.role = 'participant' and lp.active)`)
    .orderBy("lobbies.created_at", "asc")
    .execute();

  for (const lobby of candidates) {
    if (Number(lobby.participants) >= lobby.max_players) continue;
    const result = await joinLobby(lobby, identity, "participant");
    if (result.ok) return NextResponse.json({ code: lobby.code });
    if (result.reason === "already_in_room") {
      return NextResponse.json(
        { error: await msg("already_in_room"), code: "already_in_room", currentCode: result.currentCode },
        { status: 409 },
      );
    }
  }

  return NextResponse.json(
    { error: await msg("none_available"), code: "none_available", canCreate: identity.kind === "user" },
    { status: 404 },
  );
}
