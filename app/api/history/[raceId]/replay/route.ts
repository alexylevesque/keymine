import { NextResponse } from "next/server";
import { z } from "zod";
import { msg } from "@/lib/api-messages";
import { getIdentity } from "@/lib/auth/identity";
import { kysely as db } from "@/lib/db";
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
  const lobby = await db
    .selectFrom("race_participants")
    .innerJoin("races", "races.id", "race_participants.race_id")
    .innerJoin("lobbies", "lobbies.id", "races.lobby_id")
    .selectAll("lobbies")
    .where("race_participants.race_id", "=", parsed.data.raceId)
    .where("race_participants.user_id", "=", identity.userId)
    .executeTakeFirst();
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
        .updateTable("lobbies")
        .set({ status: "lobby", last_host_seen_at: new Date() })
        .where("id", "=", lobby.id)
        .where("status", "=", "finished")
        .execute();
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
