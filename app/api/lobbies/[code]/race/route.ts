import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { raceParticipants, races } from "@/db/schema";
import { getIdentity } from "@/lib/auth/identity";
import { getLobbyByCode } from "@/lib/lobby";
import { msg } from "@/lib/api-messages";

// Donne au client tout ce qu'il faut pour afficher /course/[code]: le texte
// de la course (même texte pour tous, TXT-8), et lequel des participants
// c'est "lui" (pour envoyer sa progression au serveur temps réel).
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  const race = await db.query.races.findFirst({
    where: eq(races.lobby_id, lobby.id),
    orderBy: desc(races.created_at),
  });
  if (!race) return NextResponse.json({ error: await msg("no_race") }, { status: 404 });

  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json(
      { error: await msg("pseudo_required"), code: "pseudo_required" },
      { status: 401 },
    );
  }
  const me = await db.query.raceParticipants.findFirst({
    columns: { id: true, role: true, status: true },
    where: and(
      eq(raceParticipants.race_id, race.id),
      identity.kind === "user"
        ? eq(raceParticipants.user_id, identity.userId)
        : eq(raceParticipants.guest_id, identity.guestId),
    ),
  });

  return NextResponse.json({
    race: {
      id: race.id,
      textContent: race.text_content,
      language: race.language,
      durationSeconds: race.duration_seconds,
      startsAt: race.starts_at,
      status: race.status,
      settings: race.settings,
    },
    lobby: { code: lobby.code, errorMode: lobby.error_mode, penaltySeconds: lobby.penalty_seconds },
    me: me ? { participantId: me.id, role: me.role, status: me.status } : null,
  });
}
