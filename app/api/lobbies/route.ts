import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getIdentity } from "@/lib/auth/identity";
import { findActiveRoom } from "@/lib/lobby";
import { createLobby } from "@/lib/lobby-create";
import { lobbySettingsSchema } from "@/lib/lobby-schema";
import { msg, zodMessage } from "@/lib/api-messages";
import { defaultRoomName } from "@/lib/room-name";
import { translate } from "@/lib/i18n-dictionary";
import { getRequestLang } from "@/lib/i18n-server";

// COUR-16: liste des lobbys publics affichée à l'accueil.
export async function GET() {
  const lobbies = await db
    .selectFrom("lobbies")
    .where("status", "=", "lobby")
    .where("access", "=", "public")
    .select((eb) => [
      "id",
      "code",
      "name",
      "language",
      "text_type",
      "complexity",
      "max_players",
      eb
        .selectFrom("lobby_players")
        .select((inner) => inner.fn.countAll<number>().as("count"))
        .whereRef("lobby_players.lobby_id", "=", "lobbies.id")
        .where("role", "=", "participant")
        .as("player_count"),
    ])
    .orderBy("created_at", "desc")
    .limit(20)
    .execute();

  return NextResponse.json({
    lobbies: lobbies.map((l) => ({
      code: l.code,
      name: l.name,
      language: l.language,
      textType: l.text_type,
      complexity: l.complexity,
      maxPlayers: l.max_players,
      playerCount: Number(l.player_count ?? 0),
    })),
  });
}

// COUR-1: l'hôte crée la course et règle les options.
export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => ({}));
  // CONF-02 : sans langue précisée (partie rapide, salle par défaut), le texte suit la langue du site.
  const withLanguage =
    raw && typeof raw === "object" && !("language" in raw) ? { ...raw, language: await getRequestLang() } : raw;
  const body = lobbySettingsSchema.safeParse(withLanguage);
  if (!body.success) {
    return NextResponse.json(
      { error: await zodMessage(body.error, "bad_settings") },
      { status: 400 },
    );
  }

  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json(
      { error: await msg("login_required"), code: "account_required" },
      { status: 401 },
    );
  }
  // AUTH-03: un invité ne peut pas créer de salle.
  if (identity.kind !== "user") {
    return NextResponse.json(
      { error: await msg("account_required"), code: "account_required" },
      { status: 403 },
    );
  }
  // SALLE-06: on ne peut pas créer une salle si on est déjà dans une autre.
  const current = await findActiveRoom(identity);
  if (current) {
    return NextResponse.json(
      { error: await msg("already_in_room"), code: "already_in_room", currentCode: current.code },
      { status: 409 },
    );
  }
  // Sans nom saisi : « Salle de {pseudo} » (jamais un nom vide ou « sans nom »).
  const name =
    body.data.name ??
    defaultRoomName(
      identity.displayName,
      translate(await getRequestLang(), "create.default_name_prefix"),
    );
  const code = await createLobby(identity.userId, { ...body.data, name });
  return NextResponse.json({ code });
}
