import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const eventStatus = pgEnum("event_status", [
  "draft",
  "active",
  "complete",
]);

export const roundStatus = pgEnum("round_status", [
  "pending",
  "active",
  "complete",
]);

export const matchStatus = pgEnum("match_status", [
  "pending",
  "in_progress",
  "complete",
]);

export const tournamentFormat = pgEnum("tournament_format", [
  "single_elim",
  "double_elim",
  "round_robin",
  "swiss",
]);

export const bracketSide = pgEnum("bracket_side", [
  "winners",
  "losers",
  "grand_final",
  "none",
]);

export const matchSlot = pgEnum("match_slot", ["A", "B"]);

export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    slugIdx: uniqueIndex("leagues_slug_idx").on(t.slug),
  })
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    leagueToken: text("league_token").notNull(),
    displayName: text("display_name").notNull(),
    nickname: text("nickname"),
    avatarNeutralUrl: text("avatar_neutral_url"),
    avatarVictoryUrl: text("avatar_victory_url"),
    avatarDefeatedUrl: text("avatar_defeated_url"),
    selfieUrl: text("selfie_url"),
    ballerArchetype: text("baller_archetype"),
    // Set when baller-gen starts; cleared when the background job finishes
    // (success or failure). The player page polls while this is non-null.
    jobStartedAt: timestamp("job_started_at", { withTimezone: true }),
    // Populated when the background job throws. Cleared on the next
    // successful regen. Surfaced in BallerForm so failures stop being silent.
    jobError: text("job_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    leagueIdx: index("players_league_idx").on(t.leagueId),
    tokenIdx: uniqueIndex("players_league_token_idx").on(t.leagueToken),
  })
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    format: tournamentFormat("format").notNull(),
    status: eventStatus("status").notNull().default("draft"),
    // Swiss only; null for elim formats (derived from bracket size) and
    // round_robin (derived from player count).
    totalRounds: integer("total_rounds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    leagueIdx: index("events_league_idx").on(t.leagueId),
  })
);

export const eventPlayers = pgTable(
  "event_players",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(),
    finalStanding: integer("final_standing"),
    withdrawn: boolean("withdrawn").notNull().default(false),
    joinToken: text("join_token").notNull(),
  },
  (t) => ({
    pk: uniqueIndex("event_players_pk").on(t.eventId, t.playerId),
    tokenIdx: uniqueIndex("event_players_token_idx").on(t.joinToken),
  })
);

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    // Used for double-elim to disambiguate W-R1 / L-R1; "none" otherwise.
    bracketSide: bracketSide("bracket_side").notNull().default("none"),
    status: roundStatus("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("rounds_event_side_number_idx").on(
      t.eventId,
      t.bracketSide,
      t.roundNumber
    ),
  })
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    // Denormalized for fast bracket queries — every match is fetched via eventId
    // and we don't want to join through rounds every time.
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    bracketSide: bracketSide("bracket_side").notNull().default("none"),
    // Position within (round, side). Drives bracket layout math.
    slotIndex: integer("slot_index").notNull(),
    tableNumber: integer("table_number"),
    playerAId: uuid("player_a_id").references(() => players.id), // null = TBD
    playerBId: uuid("player_b_id").references(() => players.id), // null = TBD or bye
    // Self-FKs for bracket edges. Set during materialize() in a second pass
    // (HTTP driver has no transactions, so we insert with NULL then UPDATE).
    nextMatchWinId: uuid("next_match_win_id"),
    nextMatchLoseId: uuid("next_match_lose_id"),
    nextSlot: matchSlot("next_slot"),
    nextLoseSlot: matchSlot("next_lose_slot"),
    status: matchStatus("status").notNull().default("pending"),
    winnerId: uuid("winner_id").references(() => players.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    roundIdx: index("matches_round_idx").on(t.roundId),
    eventIdx: index("matches_event_idx").on(t.eventId),
    nextWinIdx: index("matches_next_win_idx").on(t.nextMatchWinId),
    nextLoseIdx: index("matches_next_lose_idx").on(t.nextMatchLoseId),
  })
);

export type League = typeof leagues.$inferSelect;
export type NewLeague = typeof leagues.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventPlayer = typeof eventPlayers.$inferSelect;
export type NewEventPlayer = typeof eventPlayers.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
