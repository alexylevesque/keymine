// Types Kysely décrivant les tables Postgres (voir db/migrations/0001_init.sql).
// Écrits à la main plutôt que générés: pas d'outil de codegen réseau requis.
import type { ColumnType, Generated } from "kysely";

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

export interface UsersTable {
  id: Generated<string>;
  username: string;
  password_hash: string;
  display_name: string;
  avatar_url: string | null;
  avatar_source: Generated<AvatarSource>;
  avatar_data: Buffer | null;
  avatar_updated_at: ColumnType<Date, Date | null, Date | null> | null;
  discord_id: string | null;
  github_id: string | null;
  failed_login_attempts: Generated<number>;
  locked_until: ColumnType<Date, Date | null, Date | null> | null;
  best_wpm: Generated<number>;
  /** Expérience totale (jamais négative) ; le niveau en découle (lib/xp.ts). */
  xp_total: Generated<number>;
  /** Objet à usage unique activé pour la prochaine course (lib/items.ts). */
  active_item: string | null;
  /** Graine secrète des trois choix de la table d'enchantement (changée après chaque enchantement). */
  enchant_seed: Generated<number>;
  /** Bonus d'XP du classement (0,15 = +15 %), actif jusqu'à `xp_boost_until`. */
  xp_boost: Generated<number>;
  xp_boost_until: ColumnType<Date, Date | null, Date | null> | null;
  /** Classe : 0 bronze, 1 argent, 2 or, 3 diamant, 4 netherite. */
  league: Generated<number>;
  total_races: Generated<number>;
  total_errors: Generated<number>;
  total_chars_typed: Generated<number>;
  current_streak_days: Generated<number>;
  last_race_at: ColumnType<Date, Date | null, Date | null> | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface KeyStatsTable {
  user_id: string;
  char: string;
  correct_count: Generated<number>;
  error_count: Generated<number>;
}

export interface LobbiesTable {
  id: Generated<string>;
  code: string;
  host_user_id: string | null;
  host_guest_id: string | null;
  access: Generated<Access>;
  name: string;
  language: Generated<Language>;
  max_players: Generated<number>;
  duration_seconds: Generated<number>;
  text_type: Generated<TextType>;
  complexity: Generated<Difficulty>;
  text_length: Generated<number>;
  error_mode: Generated<ErrorMode>;
  penalty_seconds: Generated<number>;
  allow_uppercase: Generated<boolean>;
  allow_punctuation: Generated<boolean>;
  allow_digits: Generated<boolean>;
  allow_accents: Generated<boolean>;
  include_chars: Generated<string[]>;
  exclude_chars: Generated<string[]>;
  comeback_bonus: Generated<boolean>;
  bonus_kinds: Generated<string[]>;
  accent_wanted: Generated<string[]>;
  accent_forbidden: Generated<string[]>;
  status: Generated<LobbyStatus>;
  is_quick: Generated<boolean>;
  auto_start_at: ColumnType<Date, Date | string | null, Date | string | null> | null;
  created_at: ColumnType<Date, string | undefined, never>;
  last_host_seen_at: ColumnType<Date, string | undefined, Date | string>;
  closed_at: ColumnType<Date, Date | null, Date | null> | null;
}

export interface LobbyPlayersTable {
  id: Generated<string>;
  lobby_id: string;
  user_id: string | null;
  guest_id: string | null;
  guest_name: string | null;
  role: Generated<PlayerRole>;
  is_bot: Generated<boolean>;
  bot_level: BotLevel | null;
  active: Generated<boolean>;
  joined_at: ColumnType<Date, string | undefined, Date | string>;
  last_seen_at: ColumnType<Date, string | undefined, Date | string>;
}

export interface CorpusTextsTable {
  id: Generated<number>;
  language: Language;
  title: string;
  source: Generated<string>;
  content: string;
  word_count: number;
  difficulty: Generated<Difficulty>;
  has_accents: Generated<boolean>;
  has_digits: Generated<boolean>;
  has_punctuation: Generated<boolean>;
}

export interface CorpusWordsTable {
  id: Generated<number>;
  language: Language;
  word: string;
  frequency_rank: Generated<number>;
  has_accents: Generated<boolean>;
}

export interface RacesTable {
  id: Generated<string>;
  lobby_id: string;
  text_content: string;
  language: Language;
  settings: Generated<unknown>;
  seed: Generated<number>;
  comeback_bonus: Generated<boolean>;
  bonus_kinds: Generated<string[]>;
  status: Generated<RaceStatus>;
  starts_at: ColumnType<Date, string, never>;
  duration_seconds: number;
  ends_at: ColumnType<Date, Date | null, Date | null> | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface RaceParticipantsTable {
  id: Generated<string>;
  race_id: string;
  lobby_player_id: string | null;
  user_id: string | null;
  guest_id: string | null;
  display_name: string;
  is_bot: Generated<boolean>;
  bot_level: BotLevel | null;
  role: Generated<PlayerRole>;
  progress_chars: Generated<number>;
  error_count: Generated<number>;
  status: Generated<ParticipantStatus>;
  wpm: number | null;
  accuracy: number | null;
  finished_at: ColumnType<Date, Date | null, Date | null> | null;
  rank: number | null;
  raw_wpm: number | null;
  text_length: number | null;
  finish_ms: number | null;
  penalty_ms: Generated<number>;
  hidden_from_history: Generated<boolean>;
  bonuses: Generated<unknown>;
  wpm_series: Generated<unknown>;
  key_correct: Generated<unknown>;
  key_errors: Generated<unknown>;
  /** XP gagnée (ou perdue, en négatif, pour un abandon volontaire) ; null pour les bots et invités. */
  xp_gained: number | null;
  abandon_reason: "player" | "disconnected" | null;
  /** Effets figés au départ (armure + objet activé), voir lib/inventory.ts `Loadout`. */
  loadout: unknown;
  /** Charbon gagné au podium ; null pour les bots et invités. */
  coal_gained: number | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface LobbyInvitesTable {
  id: Generated<string>;
  lobby_id: string;
  token: string;
  label: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  claimed_at: ColumnType<Date, Date | null, Date | null> | null;
  claimed_ip: string | null;
  claimed_user_id: string | null;
  claimed_guest_id: string | null;
  claimed_name: string | null;
  revoked_at: ColumnType<Date, Date | null, Date | null> | null;
}

export interface LobbyBansTable {
  id: Generated<string>;
  lobby_id: string;
  user_id: string | null;
  guest_id: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface JoinAttemptsTable {
  id: Generated<string>;
  ip: string;
  attempted_at: ColumnType<Date, string | undefined, never>;
}

export type InventoryArea =
  "bag" | "armor" | "craft" | "furnace_in" | "furnace_fuel" | "furnace_out" | "enchant";

export interface InventoryItemsTable {
  user_id: string;
  area: InventoryArea;
  slot: number;
  item: string;
  count: number;
  durability: number | null;
  /** Enchantements de l'armure (lib/enchants.ts), JSON ; null si aucun. */
  enchants: unknown;
}

export interface FurnacesTable {
  user_id: string;
  burn_left: Generated<number>;
  progress_ms: Generated<number>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface ShopOffersTable {
  user_id: string;
  /** AAAA-MM-JJ, heure de Toronto. */
  day: ColumnType<string, string, string>;
  slot: number;
  item: string;
  count: number;
  price: number;
  rarity: "common" | "uncommon" | "rare" | "epic";
  stock: number;
  bought: Generated<number>;
}

export interface WeeklySettlementsTable {
  /** AAAA-MM-JJ (lundi, heure de Toronto). */
  week_start: ColumnType<string, string, string>;
  settled_at: ColumnType<Date, string | undefined, never>;
}

export interface WeeklyRewardsTable {
  id: Generated<string>;
  user_id: string;
  week_start: ColumnType<string, string, string>;
  kind: "wins" | "wpm";
  rank: number;
  xp: number;
  items: unknown;
  boost: number;
  league: Generated<number>;
  claimed_at: ColumnType<Date, Date | null, Date | null> | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface LeagueHistoryTable {
  user_id: string;
  week_start: ColumnType<string, string, string>;
  from_league: number;
  to_league: number;
  position: number;
  wins: number;
}

export interface Database {
  league_history: LeagueHistoryTable;
  weekly_settlements: WeeklySettlementsTable;
  weekly_rewards: WeeklyRewardsTable;
  inventory_items: InventoryItemsTable;
  furnaces: FurnacesTable;
  shop_offers: ShopOffersTable;
  lobby_invites: LobbyInvitesTable;
  lobby_bans: LobbyBansTable;
  join_attempts: JoinAttemptsTable;
  users: UsersTable;
  key_stats: KeyStatsTable;
  lobbies: LobbiesTable;
  lobby_players: LobbyPlayersTable;
  races: RacesTable;
  race_participants: RaceParticipantsTable;
  corpus_texts: CorpusTextsTable;
  corpus_words: CorpusWordsTable;
}
