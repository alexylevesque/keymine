import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbies, lobbyPlayers } from "@/db/schema";
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
    return NextResponse.json(
      { error: await msg("pseudo_required"), code: "pseudo_required" },
      { status: 401 },
    );
  }

  const participants = db.$count(
    lobbyPlayers,
    and(
      eq(lobbyPlayers.lobby_id, lobbies.id),
      eq(lobbyPlayers.role, "participant"),
      eq(lobbyPlayers.active, true),
    ),
  );
  const candidates = await db
    .select({
      id: lobbies.id,
      code: lobbies.code,
      max_players: lobbies.max_players,
      participants,
    })
    .from(lobbies)
    .where(and(eq(lobbies.status, "lobby"), eq(lobbies.access, "public")))
    // Le moins de places libres d'abord ; à égalité, la plus ancienne.
    .orderBy(sql`${lobbies.max_players} - ${participants}`, asc(lobbies.created_at));

  for (const lobby of candidates) {
    if (Number(lobby.participants) >= lobby.max_players) continue;
    const result = await joinLobby(lobby, identity, "participant");
    if (result.ok) return NextResponse.json({ code: lobby.code });
    if (result.reason === "already_in_room") {
      return NextResponse.json(
        {
          error: await msg("already_in_room"),
          code: "already_in_room",
          currentCode: result.currentCode,
        },
        { status: 409 },
      );
    }
  }

  return NextResponse.json(
    {
      error: await msg("none_available"),
      code: "none_available",
      canCreate: identity.kind === "user",
    },
    { status: 404 },
  );
}
