import { NextResponse } from "next/server";
import { kysely as db } from "@/lib/db";
import { getIdentity } from "@/lib/auth/identity";
import { getLobbyByCode, isHost } from "@/lib/lobby";
import { sweepLobbies } from "@/lib/lobby-sweep";
import { lobbyUpdateSchema } from "@/lib/lobby-schema";
import { revokeAllInvites } from "@/lib/invites";
import { applyLobbySettings } from "@/lib/lobby-settings";
import { assertTransition } from "@/lib/race/state";
import { loadLobbySnapshot, viewLobby, type Viewer } from "@/lib/lobby-snapshot";
import { msg, zodMessage } from "@/lib/api-messages";
import { isNameChangeLimited } from "@/lib/name-limit";

// Lecture HTTP de l'état d'une salle (repli si le WebSocket est indisponible).
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  await sweepLobbies();
  const raw = await loadLobbySnapshot(code);
  if (!raw) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  const identity = await getIdentity();
  const viewer: Viewer | null = identity
    ? {
        userId: identity.kind === "user" ? identity.userId : null,
        guestId: identity.kind === "guest" ? identity.guestId : null,
      }
    : null;
  return NextResponse.json(viewLobby(raw, viewer));
}

// COUR-13: l'hôte peut fermer la course et le lobby.
export async function DELETE(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  const identity = await getIdentity();
  if (!identity || !isHost(identity, lobby)) {
    return NextResponse.json({ error: await msg("host_only_close") }, { status: 403 });
  }

  if (lobby.status !== "closed") {
    assertTransition(lobby.status, "closed");
    await db
      .updateTable("lobbies")
      .set({ status: "closed", closed_at: new Date() })
      .where("id", "=", lobby.id)
      .execute();
    await revokeAllInvites(lobby.id); // SALLE-04 : plus aucun lien ne fonctionne
    // Une salle fermée ne retient plus personne : chacun peut en créer ou en rejoindre une autre (SALLE-06).
    await db
      .updateTable("lobby_players")
      .set({ active: false })
      .where("lobby_id", "=", lobby.id)
      .execute();
  }

  return NextResponse.json({ ok: true });
}

// CONF-12 : l'hôte modifie la configuration en salle d'attente ; tous les
// présents la voient en direct (le changement déclenche une notification Postgres).
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return NextResponse.json({ error: await msg("lobby_not_found") }, { status: 404 });

  const identity = await getIdentity();
  if (!identity || !isHost(identity, lobby)) {
    return NextResponse.json({ error: await msg("host_only_settings") }, { status: 403 });
  }
  const body = lobbyUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: await zodMessage(body.error, "bad_settings") },
      { status: 400 },
    );
  }
  // Renommer en boucle (spam de la liste publique) : au plus quelques changements de nom par minute.
  if (
    body.data.name !== undefined &&
    body.data.name !== lobby.name &&
    isNameChangeLimited(lobby.id)
  ) {
    return NextResponse.json({ error: await msg("name_rate") }, { status: 429 });
  }

  const result = await applyLobbySettings(lobby, body.data);
  if (result.ok) return NextResponse.json({ ok: true });
  switch (result.reason) {
    case "not_waiting":
      return NextResponse.json(
        { error: await msg("not_waiting"), code: "not_waiting" },
        { status: 409 },
      );
    case "capacity_too_low":
      return NextResponse.json(
        { error: await msg("capacity_too_low"), code: "capacity_too_low" },
        { status: 409 },
      );
    case "include_exclude_conflict":
      return NextResponse.json({ error: await msg("include_exclude") }, { status: 400 });
  }
}
