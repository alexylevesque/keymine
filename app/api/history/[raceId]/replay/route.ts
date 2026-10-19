import { NextResponse } from "next/server";
import { z } from "zod";
import { msg } from "@/lib/api-messages";
import { getIdentity } from "@/lib/auth/identity";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lobbies, raceParticipants, races } from "@/db/schema";
import { findActiveRoom, isHost } from "@/lib/lobby";
import { createLobby, settingsFromLobby } from "@/lib/lobby-create";

const paramsSchema = z.object({ raceId: z.uuid() });

// REJOUER depuis l'historique : ouvre une NOUVELLE salle (dont on devient l'hôte) avec les mêmes
// réglages que la course choisie. Ils restent modifiables dans la salle d'attente avant de démarrer.
export async function POST(_request: Request, ctx: RouteContext<"/api/history/[raceId]/replay">) {
  const identity = await getIdentity();
  if (!identity || identity.kind !== "user") {
    return NextResponse.json(
      { error: await msg("login_required"), code: "account_required" },
      { status: 401 },
    );
  }
  const parsed = paramsSchema.safeParse(await ctx.params);
  if (!parsed.success)
    return NextResponse.json({ error: await msg("generic"), code: "bad_request" }, { status: 400 });

  // Seules les personnes qui ont pris part à cette course (joueur ou spectateur) peuvent la rejouer.
  const [row] = await db
    .select({ lobby: lobbies })
    .from(raceParticipants)
    .innerJoin(races, eq(races.id, raceParticipants.race_id))
    .innerJoin(lobbies, eq(lobbies.id, races.lobby_id))
    .where(
      and(
        eq(raceParticipants.race_id, parsed.data.raceId),
        eq(raceParticipants.user_id, identity.userId),
      ),
    )
    .limit(1);
  const lobby = row?.lobby;
  if (!lobby)
    return NextResponse.json(
      { error: await msg("lobby_not_found"), code: "not_found" },
      { status: 404 },
    );

  // Encore dans la salle de cette course : on y retourne (l'hôte la relance si elle affiche les résultats).
  const current = await findActiveRoom(identity);
  if (current?.id === lobby.id) {
    if (lobby.status === "finished" && isHost(identity, lobby)) {
      await db
        .update(lobbies)
        .set({ status: "lobby", last_host_seen_at: new Date() })
        .where(and(eq(lobbies.id, lobby.id), eq(lobbies.status, "finished")));
    }
    return NextResponse.json({ code: lobby.code });
  }
  // SALLE-06 : pas de nouvelle salle tant qu'on est dans une autre.
  if (current) {
    return NextResponse.json(
      { error: await msg("already_in_room"), code: "already_in_room", currentCode: current.code },
      { status: 409 },
    );
  }

  const code = await createLobby(identity.userId, settingsFromLobby(lobby));
  return NextResponse.json({ code });
}
