import { NextResponse } from "next/server";
import { snapshotLoadouts } from "@/lib/inventory-store";
import { kysely as db } from "@/lib/db";
import { getIdentity } from "@/lib/auth/identity";
import { getLobbyByCode, isHost } from "@/lib/lobby";
import { botDisplayName } from "@/lib/race/bots";
import { assertTransition, canStartRace } from "@/lib/race/state";
import { NoTextAvailableError } from "@/lib/text/generate";
import { generateTextForRace } from "@/lib/text/service";
import { msg } from "@/lib/api-messages";
import { toAccentTypes } from "@/lib/lobby-choices";

const COUNTDOWN_MS = 3_000; // COURSE-03 : décompte 3, 2, 1

// COUR-1/JEU-1: l'hôte démarre la course; le serveur génère le texte et fige
// la liste des participants (bots inclus) pour tout le monde.
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
  if (!isHost(identity, lobby)) {
    return NextResponse.json({ error: await msg("host_only_start") }, { status: 403 });
  }
  if (lobby.status !== "lobby") {
    return NextResponse.json({ error: await msg("already_started") }, { status: 409 });
  }

  const players = await db
    .selectFrom("lobby_players")
    .leftJoin("users", "users.id", "lobby_players.user_id")
    .select([
      "lobby_players.id",
      "lobby_players.user_id",
      "lobby_players.guest_id",
      "lobby_players.guest_name",
      "lobby_players.role",
      "lobby_players.is_bot",
      "lobby_players.bot_level",
      "users.display_name",
    ])
    .where("lobby_id", "=", lobby.id)
    .where("lobby_players.active", "=", true)
    .execute();

  // COURSE-02 : au moins 2 participants (bots inclus) dont au moins 1 humain.
  const check = canStartRace(players.map((p) => ({ role: p.role, isBot: p.is_bot })));
  if (!check.ok) {
    return NextResponse.json(
      {
        error: await msg(check.reason === "no_human" ? "no_human" : "not_enough"),
        code: check.reason,
      },
      { status: 400 },
    );
  }

  let textContent: string;
  try {
    textContent = await generateTextForRace({
      type: lobby.text_type,
      language: lobby.language,
      length: lobby.text_length,
      complexity: lobby.complexity,
      uppercase: lobby.allow_uppercase,
      punctuation: lobby.allow_punctuation,
      digits: lobby.allow_digits,
      accents: lobby.allow_accents,
      includeChars: lobby.include_chars,
      excludeChars: lobby.exclude_chars,
      accentWanted: toAccentTypes(lobby.accent_wanted),
      accentForbidden: toAccentTypes(lobby.accent_forbidden),
    });
  } catch (error) {
    if (error instanceof NoTextAvailableError) {
      return NextResponse.json({ error: await msg("no_text"), code: "no_text" }, { status: 422 });
    }
    throw error;
  }

  const startsAt = new Date(Date.now() + COUNTDOWN_MS);

  // Course, participants et passage à DÉCOMPTE dans une seule transaction : la
  // notification Postgres qui réveille le serveur temps réel n'est émise qu'au
  // commit, quand tous les participants existent.
  assertTransition(lobby.status, "countdown");
  class AlreadyStarted extends Error {}
  let race: { id: string };
  try {
    race = await db.transaction().execute(async (trx) => {
      // Verrou logique : deux démarrages simultanés ne créent qu'une course.
      const claimed = await trx
        .updateTable("lobbies")
        .set({ status: "countdown" })
        .where("id", "=", lobby.id)
        .where("status", "=", "lobby")
        .executeTakeFirst();
      if (Number(claimed.numUpdatedRows) === 0) throw new AlreadyStarted();
      const created = await trx
        .insertInto("races")
        .values({
          lobby_id: lobby.id,
          text_content: textContent,
          language: lobby.language,
          settings: JSON.stringify({
            errorMode: lobby.error_mode,
            penaltySeconds: lobby.penalty_seconds,
            complexity: lobby.complexity, // expérience : la complexité au moment de la course
          }),
          status: "countdown",
          starts_at: startsAt.toISOString(),
          duration_seconds: lobby.duration_seconds,
          seed: Math.floor(Math.random() * 2_000_000_000),
          comeback_bonus: lobby.comeback_bonus,
          bonus_kinds: lobby.bonus_kinds,
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("race_participants")
        .values(
          players.map((p) => ({
            race_id: created.id,
            lobby_player_id: p.id,
            user_id: p.user_id,
            guest_id: p.guest_id,
            display_name:
              p.is_bot && p.bot_level
                ? botDisplayName(p.bot_level)
                : (p.display_name ?? p.guest_name ?? "Joueur"),
            is_bot: p.is_bot,
            bot_level: p.bot_level,
            role: p.role,
          })),
        )
        .execute();
      // Inventaire : effets de l'armure et de l'objet activé, figés pour la course.
      await snapshotLoadouts(trx, created.id);

      return created;
    });
  } catch (error) {
    if (error instanceof AlreadyStarted) {
      return NextResponse.json({ error: await msg("already_started") }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({ raceId: race.id, startsAt: startsAt.toISOString() });
}
