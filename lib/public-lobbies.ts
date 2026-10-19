import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { lobbies, lobbyPlayers, races, users } from "@/db/schema";

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
  // Temps restant de la course en cours ; sans temps maximal (durée 0), aucun.
  const secondsLeft = db
    .select({
      left: sql<number | null>`case when ${races.duration_seconds} = 0 then null
        else extract(epoch from (${races.starts_at} + make_interval(secs => ${races.duration_seconds}) - now())) end`,
    })
    .from(races)
    .where(and(eq(races.lobby_id, lobbies.id), inArray(races.status, ["countdown", "racing"])))
    .orderBy(desc(races.created_at))
    .limit(1);

  const rows = await db
    .select({
      code: lobbies.code,
      name: lobbies.name,
      language: lobbies.language,
      complexity: lobbies.complexity,
      text_type: lobbies.text_type,
      max_players: lobbies.max_players,
      status: lobbies.status,
      host_name: users.display_name,
      player_count: db.$count(
        lobbyPlayers,
        and(
          eq(lobbyPlayers.lobby_id, lobbies.id),
          eq(lobbyPlayers.role, "participant"),
          eq(lobbyPlayers.active, true),
        ),
      ),
      seconds_left: sql<number | string | null>`(${secondsLeft})`,
    })
    .from(lobbies)
    .leftJoin(users, eq(users.id, lobbies.host_user_id))
    .where(
      and(
        eq(lobbies.access, "public"),
        // Une salle disparaît de la liste dès la fin de la course (écran des résultats) ; elle y revient si l'hôte relance.
        inArray(lobbies.status, ["lobby", "countdown", "racing"]),
        filters.language ? eq(lobbies.language, filters.language) : undefined,
        filters.complexity ? eq(lobbies.complexity, filters.complexity) : undefined,
      ),
    )
    .orderBy(desc(lobbies.created_at))
    .limit(limit);
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
