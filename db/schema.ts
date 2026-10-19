// Schéma Drizzle ORM (TECH-04) : description TypeScript de toutes les tables.
// Les noms des propriétés sont ceux des colonnes (snake_case), donc les lignes
// lues gardent la même forme partout dans le code.
// Les migrations restent les fichiers SQL versionnés de db/migrations/ ;
// tests/db/schema.test.ts vérifie que ce schéma correspond à la base migrée.
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  Access,
  AvatarSource,
  BotLevel,
  Difficulty,
  ErrorMode,
  InventoryArea,
  Language,
  LobbyStatus,
  ParticipantStatus,
  PlayerRole,
  RaceStatus,
  TextType,
} from "./types";

/** Colonne `bytea` : photo de profil ré-encodée (AUTH-04). */
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const lobbyPlayers = pgTable(
  "lobby_players",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    lobby_id: uuid().notNull(),
    user_id: uuid(),
    guest_id: text(),
    guest_name: text(),
    role: text().default("participant").$type<PlayerRole>().notNull(),
    is_bot: boolean().default(false).notNull(),
    bot_level: text().$type<BotLevel>(),
    joined_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    last_seen_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    active: boolean().default(true).notNull(),
  },
  (table) => [
    uniqueIndex("lobby_players_guest_unique")
      .using("btree", table.lobby_id, table.guest_id)
      .where(sql`(guest_id IS NOT NULL)`),
    uniqueIndex("lobby_players_one_room_guest")
      .using("btree", table.guest_id)
      .where(sql`(active AND (guest_id IS NOT NULL))`),
    uniqueIndex("lobby_players_one_room_user")
      .using("btree", table.user_id)
      .where(sql`(active AND (user_id IS NOT NULL))`),
    uniqueIndex("lobby_players_user_unique")
      .using("btree", table.lobby_id, table.user_id)
      .where(sql`(user_id IS NOT NULL)`),
    foreignKey({
      columns: [table.lobby_id],
      foreignColumns: [lobbies.id],
      name: "lobby_players_lobby_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "lobby_players_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "lobby_players_role_check",
      sql`role = ANY (ARRAY['participant'::text, 'spectator'::text])`,
    ),
    check("lobby_players_check", sql`is_bot OR (user_id IS NOT NULL) OR (guest_id IS NOT NULL)`),
    check(
      "lobby_players_bot_level_check",
      sql`bot_level = ANY (ARRAY['noob'::text, 'debutant'::text, 'intermediaire'::text, 'expert'::text, 'impossible'::text])`,
    ),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    username: varchar({ length: 20 }).notNull(),
    password_hash: text().notNull(),
    display_name: varchar({ length: 32 }).notNull(),
    avatar_url: text(),
    avatar_source: text().default("upload").$type<AvatarSource>().notNull(),
    discord_id: text(),
    github_id: text(),
    failed_login_attempts: integer().default(0).notNull(),
    locked_until: timestamp({ withTimezone: true, mode: "date" }),
    best_wpm: real().default(0).notNull(),
    total_races: integer().default(0).notNull(),
    total_errors: integer().default(0).notNull(),
    total_chars_typed: integer().default(0).notNull(),
    current_streak_days: integer().default(0).notNull(),
    last_race_at: timestamp({ withTimezone: true, mode: "date" }),
    created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    // TODO: failed to parse database type 'bytea'
    avatar_data: bytea(),
    avatar_updated_at: timestamp({ withTimezone: true, mode: "date" }),
    xp_total: integer().default(0).notNull(),
    active_item: text(),
    enchant_seed: integer()
      .default(sql`floor(random() * 2000000000)::integer`)
      .notNull(),
    xp_boost: real().default(0).notNull(),
    xp_boost_until: timestamp({ withTimezone: true, mode: "date" }),
    league: smallint().default(0).notNull(),
  },
  (table) => [
    unique("users_username_key").on(table.username),
    unique("users_discord_id_key").on(table.discord_id),
    unique("users_github_id_key").on(table.github_id),
    check(
      "users_avatar_source_check",
      sql`avatar_source = ANY (ARRAY['upload'::text, 'discord'::text, 'github'::text])`,
    ),
    check("users_xp_total_check", sql`xp_total >= 0`),
    check("users_league_check", sql`(league >= 0) AND (league <= 4)`),
  ],
);

export const lobbies = pgTable(
  "lobbies",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: varchar({ length: 8 }).notNull(),
    host_user_id: uuid(),
    host_guest_id: text(),
    access: text().default("public").$type<Access>().notNull(),
    name: text().notNull(),
    language: text().default("fr").$type<Language>().notNull(),
    max_players: integer().default(30).notNull(),
    duration_seconds: integer().default(300).notNull(),
    text_length: integer().default(40).notNull(),
    error_mode: text().default("accumuler").$type<ErrorMode>().notNull(),
    penalty_seconds: real().default(1).notNull(),
    allow_uppercase: boolean().default(false).notNull(),
    allow_punctuation: boolean().default(false).notNull(),
    allow_digits: boolean().default(false).notNull(),
    status: text().default("lobby").$type<LobbyStatus>().notNull(),
    is_quick: boolean().default(false).notNull(),
    auto_start_at: timestamp({ withTimezone: true, mode: "date" }),
    created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    last_host_seen_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    closed_at: timestamp({ withTimezone: true, mode: "date" }),
    text_type: text().default("coherent").$type<TextType>().notNull(),
    complexity: text().default("easy").$type<Difficulty>().notNull(),
    allow_accents: boolean().default(true).notNull(),
    include_chars: text()
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    exclude_chars: text()
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    comeback_bonus: boolean().default(true).notNull(),
    bonus_kinds: text().array().default(["minus_words", "plus_words", "fog"]).notNull(),
    accent_wanted: text()
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    accent_forbidden: text()
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
  },
  (table) => [
    index("lobbies_status_access_idx")
      .using("btree", table.status, table.access)
      .where(sql`(status = 'lobby'::text)`),
    foreignKey({
      columns: [table.host_user_id],
      foreignColumns: [users.id],
      name: "lobbies_host_user_id_fkey",
    }).onDelete("set null"),
    unique("lobbies_code_key").on(table.code),
    check(
      "lobbies_access_check",
      sql`access = ANY (ARRAY['public'::text, 'unlisted'::text, 'private'::text])`,
    ),
    check("lobbies_language_check", sql`language = ANY (ARRAY['fr'::text, 'en'::text])`),
    check("lobbies_text_length_check", sql`(text_length >= 10) AND (text_length <= 400)`),
    check(
      "lobbies_error_mode_check",
      sql`error_mode = ANY (ARRAY['accumuler'::text, 'bloquer'::text])`,
    ),
    check(
      "lobbies_status_check",
      sql`status = ANY (ARRAY['lobby'::text, 'countdown'::text, 'racing'::text, 'finished'::text, 'closed'::text])`,
    ),
    check("lobbies_check", sql`(host_user_id IS NOT NULL) OR (host_guest_id IS NOT NULL)`),
    check(
      "lobbies_text_type_check",
      sql`text_type = ANY (ARRAY['coherent'::text, 'aleatoire'::text])`,
    ),
    check(
      "lobbies_complexity_check",
      sql`complexity = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])`,
    ),
    check("lobbies_max_players_check", sql`(max_players >= 2) AND (max_players <= 30)`),
    check(
      "lobbies_duration_seconds_check",
      sql`(duration_seconds = 0) OR ((duration_seconds >= 30) AND (duration_seconds <= 600))`,
    ),
  ],
);

export const corpusTexts = pgTable(
  "corpus_texts",
  {
    id: serial().primaryKey().notNull(),
    language: text().$type<Language>().notNull(),
    title: text().notNull(),
    source: text().default("domaine public").notNull(),
    content: text().notNull(),
    word_count: integer().notNull(),
    difficulty: text().default("easy").$type<Difficulty>().notNull(),
    has_accents: boolean().default(false).notNull(),
    has_digits: boolean().default(false).notNull(),
    has_punctuation: boolean().default(false).notNull(),
  },
  (table) => [
    index("corpus_texts_lang_idx").using("btree", table.language, table.difficulty),
    unique("corpus_texts_language_content_key").on(table.content, table.language),
    check(
      "corpus_texts_difficulty_check",
      sql`difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])`,
    ),
    check("corpus_texts_language_check", sql`language = ANY (ARRAY['fr'::text, 'en'::text])`),
    check("corpus_texts_word_count_check", sql`word_count > 0`),
  ],
);

export const corpusWords = pgTable(
  "corpus_words",
  {
    id: serial().primaryKey().notNull(),
    language: text().$type<Language>().notNull(),
    word: text().notNull(),
    frequency_rank: integer().default(1000).notNull(),
    has_accents: boolean().default(false).notNull(),
  },
  (table) => [
    index("corpus_words_lang_idx").using("btree", table.language, table.frequency_rank),
    unique("corpus_words_language_word_key").on(table.language, table.word),
    check("corpus_words_language_check", sql`language = ANY (ARRAY['fr'::text, 'en'::text])`),
  ],
);

export const joinAttempts = pgTable(
  "join_attempts",
  {
    id: bigserial({ mode: "number" }).primaryKey().notNull(),
    ip: text().notNull(),
    attempted_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("join_attempts_ip_time").using("btree", table.ip, table.attempted_at)],
);

export const lobbyInvites = pgTable(
  "lobby_invites",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    lobby_id: uuid().notNull(),
    token: text().notNull(),
    label: text(),
    created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    claimed_at: timestamp({ withTimezone: true, mode: "date" }),
    claimed_ip: text(),
    claimed_user_id: uuid(),
    claimed_guest_id: text(),
    claimed_name: text(),
    revoked_at: timestamp({ withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("lobby_invites_lobby").using("btree", table.lobby_id),
    foreignKey({
      columns: [table.lobby_id],
      foreignColumns: [lobbies.id],
      name: "lobby_invites_lobby_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.claimed_user_id],
      foreignColumns: [users.id],
      name: "lobby_invites_claimed_user_id_fkey",
    }).onDelete("set null"),
    unique("lobby_invites_token_key").on(table.token),
  ],
);

export const races = pgTable(
  "races",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    lobby_id: uuid().notNull(),
    text_content: text().notNull(),
    language: text().$type<Language>().notNull(),
    settings: jsonb().default({}).$type<unknown>().notNull(),
    status: text().default("countdown").$type<RaceStatus>().notNull(),
    starts_at: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    duration_seconds: integer().notNull(),
    ends_at: timestamp({ withTimezone: true, mode: "date" }),
    created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    seed: integer().default(0).notNull(),
    comeback_bonus: boolean().default(false).notNull(),
    bonus_kinds: text().array().default(["minus_words", "plus_words", "fog"]).notNull(),
  },
  (table) => [
    index("races_lobby_idx").using("btree", table.lobby_id, table.created_at.desc()),
    foreignKey({
      columns: [table.lobby_id],
      foreignColumns: [lobbies.id],
      name: "races_lobby_id_fkey",
    }).onDelete("cascade"),
    check(
      "races_status_check",
      sql`status = ANY (ARRAY['countdown'::text, 'racing'::text, 'finished'::text])`,
    ),
  ],
);

export const lobbyBans = pgTable(
  "lobby_bans",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    lobby_id: uuid().notNull(),
    user_id: uuid(),
    guest_id: text(),
    created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lobby_bans_guest_unique")
      .using("btree", table.lobby_id, table.guest_id)
      .where(sql`(guest_id IS NOT NULL)`),
    uniqueIndex("lobby_bans_user_unique")
      .using("btree", table.lobby_id, table.user_id)
      .where(sql`(user_id IS NOT NULL)`),
    foreignKey({
      columns: [table.lobby_id],
      foreignColumns: [lobbies.id],
      name: "lobby_bans_lobby_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "lobby_bans_user_id_fkey",
    }).onDelete("cascade"),
    check("lobby_bans_check", sql`(user_id IS NOT NULL) OR (guest_id IS NOT NULL)`),
  ],
);

export const furnaces = pgTable(
  "furnaces",
  {
    user_id: uuid().primaryKey().notNull(),
    burn_left: smallint().default(0).notNull(),
    progress_ms: integer().default(0).notNull(),
    updated_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "furnaces_user_id_fkey",
    }).onDelete("cascade"),
    check("furnaces_burn_left_check", sql`(burn_left >= 0) AND (burn_left <= 8)`),
    check("furnaces_progress_ms_check", sql`progress_ms >= 0`),
  ],
);

export const raceParticipants = pgTable(
  "race_participants",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    race_id: uuid().notNull(),
    lobby_player_id: uuid(),
    user_id: uuid(),
    guest_id: text(),
    display_name: text().notNull(),
    is_bot: boolean().default(false).notNull(),
    bot_level: text().$type<BotLevel>(),
    role: text().default("participant").$type<PlayerRole>().notNull(),
    progress_chars: integer().default(0).notNull(),
    error_count: integer().default(0).notNull(),
    status: text().default("racing").$type<ParticipantStatus>().notNull(),
    wpm: real(),
    accuracy: real(),
    finished_at: timestamp({ withTimezone: true, mode: "date" }),
    rank: integer(),
    key_correct: jsonb().default({}).$type<unknown>().notNull(),
    key_errors: jsonb().default({}).$type<unknown>().notNull(),
    created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    raw_wpm: real(),
    text_length: integer(),
    finish_ms: integer(),
    bonuses: jsonb().default([]).$type<unknown>().notNull(),
    wpm_series: jsonb().default([]).$type<unknown>().notNull(),
    penalty_ms: integer().default(0).notNull(),
    hidden_from_history: boolean().default(false).notNull(),
    xp_gained: integer(),
    abandon_reason: text().$type<"player" | "disconnected">(),
    loadout: jsonb().$type<unknown>(),
    coal_gained: integer(),
  },
  (table) => [
    index("race_participants_race_idx").using("btree", table.race_id),
    index("race_participants_user_idx").using("btree", table.user_id),
    index("race_participants_wins_idx")
      .using("btree", table.user_id, table.finished_at)
      .where(sql`((status = 'finished'::text) AND (rank = 1) AND (role = 'participant'::text))`),
    foreignKey({
      columns: [table.race_id],
      foreignColumns: [races.id],
      name: "race_participants_race_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.lobby_player_id],
      foreignColumns: [lobbyPlayers.id],
      name: "race_participants_lobby_player_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "race_participants_user_id_fkey",
    }).onDelete("set null"),
    check(
      "race_participants_role_check",
      sql`role = ANY (ARRAY['participant'::text, 'spectator'::text])`,
    ),
    check(
      "race_participants_bot_level_check",
      sql`bot_level = ANY (ARRAY['noob'::text, 'debutant'::text, 'intermediaire'::text, 'expert'::text, 'impossible'::text])`,
    ),
    check(
      "race_participants_status_check",
      sql`status = ANY (ARRAY['racing'::text, 'finished'::text, 'timeout'::text, 'abandoned'::text])`,
    ),
    check(
      "race_participants_abandon_reason_check",
      sql`abandon_reason = ANY (ARRAY['player'::text, 'disconnected'::text])`,
    ),
  ],
);

export const weeklySettlements = pgTable("weekly_settlements", {
  week_start: date().primaryKey().notNull(),
  settled_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const weeklyRewards = pgTable(
  "weekly_rewards",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    user_id: uuid().notNull(),
    week_start: date().notNull(),
    kind: text().$type<"wins" | "wpm">().notNull(),
    rank: integer().notNull(),
    xp: integer().default(0).notNull(),
    items: jsonb().default([]).$type<unknown>().notNull(),
    boost: real().default(0).notNull(),
    claimed_at: timestamp({ withTimezone: true, mode: "date" }),
    created_at: timestamp({ withTimezone: true, mode: "date" }).defaultNow().notNull(),
    league: smallint().default(0).notNull(),
  },
  (table) => [
    index("weekly_rewards_week_idx").using("btree", table.week_start, table.kind, table.rank),
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "weekly_rewards_user_id_fkey",
    }).onDelete("cascade"),
    unique("weekly_rewards_user_id_week_start_kind_key").on(
      table.kind,
      table.user_id,
      table.week_start,
    ),
    check("weekly_rewards_kind_check", sql`kind = ANY (ARRAY['wins'::text, 'wpm'::text])`),
    check("weekly_rewards_rank_check", sql`rank >= 1`),
    check("weekly_rewards_xp_check", sql`xp >= 0`),
    check(
      "weekly_rewards_boost_check",
      sql`(boost >= (0)::double precision) AND (boost <= (1)::double precision)`,
    ),
  ],
);

export const keyStats = pgTable(
  "key_stats",
  {
    user_id: uuid().notNull(),
    char: text().notNull(),
    correct_count: integer().default(0).notNull(),
    error_count: integer().default(0).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "key_stats_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.char, table.user_id], name: "key_stats_pkey" }),
  ],
);

export const leagueHistory = pgTable(
  "league_history",
  {
    user_id: uuid().notNull(),
    week_start: date().notNull(),
    from_league: smallint().notNull(),
    to_league: smallint().notNull(),
    position: integer().notNull(),
    wins: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "league_history_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.user_id, table.week_start], name: "league_history_pkey" }),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    user_id: uuid().notNull(),
    area: text().$type<InventoryArea>().notNull(),
    slot: smallint().notNull(),
    item: text().notNull(),
    count: integer().notNull(),
    durability: integer(),
    enchants: jsonb().$type<unknown>(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "inventory_items_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.area, table.slot, table.user_id], name: "inventory_items_pkey" }),
    check("inventory_items_slot_check", sql`(slot >= 0) AND (slot < 27)`),
    check("inventory_items_count_check", sql`(count >= 1) AND (count <= 64)`),
    check("inventory_items_durability_check", sql`durability > 0`),
    check(
      "inventory_items_area_check",
      sql`area = ANY (ARRAY['bag'::text, 'armor'::text, 'craft'::text, 'furnace_in'::text, 'furnace_fuel'::text, 'furnace_out'::text, 'enchant'::text])`,
    ),
  ],
);

export const shopOffers = pgTable(
  "shop_offers",
  {
    user_id: uuid().notNull(),
    day: date().notNull(),
    slot: smallint().notNull(),
    item: text().notNull(),
    count: integer().notNull(),
    price: integer().notNull(),
    rarity: text().$type<"common" | "uncommon" | "rare" | "epic">().notNull(),
    stock: integer().notNull(),
    bought: integer().default(0).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.user_id],
      foreignColumns: [users.id],
      name: "shop_offers_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.day, table.slot, table.user_id], name: "shop_offers_pkey" }),
    check("shop_offers_slot_check", sql`(slot >= 0) AND (slot <= 5)`),
    check("shop_offers_count_check", sql`count > 0`),
    check("shop_offers_price_check", sql`price > 0`),
    check(
      "shop_offers_rarity_check",
      sql`rarity = ANY (ARRAY['common'::text, 'uncommon'::text, 'rare'::text, 'epic'::text])`,
    ),
    check("shop_offers_stock_check", sql`stock > 0`),
    check("shop_offers_check", sql`(bought >= 0) AND (bought <= stock)`),
  ],
);

export type User = typeof users.$inferSelect;
export type Lobby = typeof lobbies.$inferSelect;
export type LobbyPlayer = typeof lobbyPlayers.$inferSelect;
export type Race = typeof races.$inferSelect;
export type RaceParticipant = typeof raceParticipants.$inferSelect;
