// Types des valeurs énumérées stockées en base (contraintes CHECK des migrations).
// Les tables elles-mêmes sont décrites par le schéma Drizzle (db/schema.ts).

export type Access = "public" | "unlisted" | "private";
export type Language = "fr" | "en";
export type Difficulty = "easy" | "medium" | "hard";
export type TextType = "coherent" | "aleatoire";
export type ErrorMode = "accumuler" | "bloquer";
export type LobbyStatus = "lobby" | "countdown" | "racing" | "finished" | "closed";
export type PlayerRole = "participant" | "spectator";
export type BotLevel = "noob" | "debutant" | "intermediaire" | "expert" | "impossible";
export type RaceStatus = "countdown" | "racing" | "finished";
export type ParticipantStatus = "racing" | "finished" | "timeout" | "abandoned";
export type AvatarSource = "upload" | "discord" | "github";

export type InventoryArea =
  "bag" | "armor" | "craft" | "furnace_in" | "furnace_fuel" | "furnace_out" | "enchant";
