import { sql } from "kysely";
import { z } from "zod";
import { db } from "@/lib/db";

// JOIN-02 : explorateur des salles publiques (filtres langue et complexité).
export const publicLobbyFilters = z.object({
  language: z.enum(["fr", "en"]).optional(),
  complexity: z.enum(["easy", "medium", "hard"]).optional(),
});
export type PublicLobbyFilters = z.infer<typeof publicLobbyFilters>;

export type PublicLobby = {
  code: string;
  name: string;
  language: "fr" | "en";
  complexity: "easy" | "medium" | "hard";
  textType: "coherent" | "aleatoire";
  hostName: string | null;
  players: number;
  capacity: number;
  /** « lobby » : en attente ; « countdown » / « racing » : course en cours (la salle reste listée, SALLE-09). */
  status: "lobby" | "countdown" | "racing";
  /** Secondes restantes de la course en cours (mesurées au moment de la requête) ; null hors course. */
  secondsLeft: number | null;
  /** On peut rejoindre : salle en attente avec de la place (SALLE-09 : jamais pendant une course). */
  joinable: boolean;
};

export async function listPublicLobbies(
  filters: PublicLobbyFilters = {},
  limit = 50,
): Promise<PublicLobby[]> {
  let query = db
    .selectFrom("lobbies")
    .leftJoin("users", "users.id", "lobbies.host_user_id")
    .where("lobbies.access", "=", "public")
    // Une salle disparaît de la liste dès la fin de la course (écran des résultats) ; elle y revient si l'hôte relance.
    .where("lobbies.status", "in", ["lobby", "countdown", "racing"])
    .select((eb) => [
      "lobbies.code",
      "lobbies.name",
      "lobbies.language",
      "lobbies.complexity",
      "lobbies.text_type",
      "lobbies.max_players",
      "lobbies.status",
      "users.display_name as host_name",
      eb
        .selectFrom("lobby_players")
        .select((inner) => inner.fn.countAll<string>().as("n"))
        .whereRef("lobby_players.lobby_id", "=", "lobbies.id")
        .where("lobby_players.role", "=", "participant")
        .where("lobby_players.active", "=", true)
        .as("player_count"),
      eb
        .selectFrom("races")
        .select(
          // Sans temps maximal (durée 0), pas de temps restant.
          sql<number | null>`case when races.duration_seconds = 0 then null else extract(epoch from (races.starts_at + make_interval(secs => races.duration_seconds) - now())) end`.as(
            "left",
          ),
        )
        .whereRef("races.lobby_id", "=", "lobbies.id")
        .where("races.status", "in", ["countdown", "racing"])
        .orderBy("races.created_at", "desc")
        .limit(1)
        .as("seconds_left"),
    ]);
  if (filters.language) query = query.where("lobbies.language", "=", filters.language);
  if (filters.complexity) query = query.where("lobbies.complexity", "=", filters.complexity);

  const rows = await query.orderBy("lobbies.created_at", "desc").limit(limit).execute();
  return rows.map((r) => {
    const players = Number(r.player_count ?? 0);
    return {
      code: r.code,
      name: r.name,
      language: r.language,
      complexity: r.complexity,
      textType: r.text_type,
      hostName: r.host_name,
      players,
      capacity: r.max_players,
      status: r.status as PublicLobby["status"],
      // null : salle en attente, ou course sans temps maximal (CONF-01).
      secondsLeft:
        r.status === "lobby" || r.seconds_left === null
          ? null
          : Math.max(0, Math.ceil(Number(r.seconds_left))),
      joinable: r.status === "lobby" && players < r.max_players,
    };
  });
}
