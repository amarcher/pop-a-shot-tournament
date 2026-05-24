CREATE TYPE "public"."bracket_side" AS ENUM('winners', 'losers', 'grand_final', 'none');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'active', 'complete');--> statement-breakpoint
CREATE TYPE "public"."match_slot" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('pending', 'active', 'complete');--> statement-breakpoint
CREATE TYPE "public"."tournament_format" AS ENUM('single_elim', 'double_elim', 'round_robin', 'swiss');--> statement-breakpoint
CREATE TABLE "event_players" (
	"event_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"seed" integer NOT NULL,
	"final_standing" integer,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"join_token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" "tournament_format" NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"total_rounds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"bracket_side" "bracket_side" DEFAULT 'none' NOT NULL,
	"slot_index" integer NOT NULL,
	"table_number" integer,
	"player_a_id" uuid,
	"player_b_id" uuid,
	"next_match_win_id" uuid,
	"next_match_lose_id" uuid,
	"next_slot" "match_slot",
	"next_lose_slot" "match_slot",
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"winner_id" uuid,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"league_token" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_neutral_url" text,
	"avatar_victory_url" text,
	"avatar_defeated_url" text,
	"selfie_url" text,
	"baller_archetype" text,
	"job_started_at" timestamp with time zone,
	"job_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"bracket_side" "bracket_side" DEFAULT 'none' NOT NULL,
	"status" "round_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "event_players" ADD CONSTRAINT "event_players_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_players" ADD CONSTRAINT "event_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_a_id_players_id_fk" FOREIGN KEY ("player_a_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_b_id_players_id_fk" FOREIGN KEY ("player_b_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_players_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_players_pk" ON "event_players" USING btree ("event_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_players_token_idx" ON "event_players" USING btree ("join_token");--> statement-breakpoint
CREATE INDEX "events_league_idx" ON "events" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_slug_idx" ON "leagues" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "matches_round_idx" ON "matches" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "matches_event_idx" ON "matches" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "matches_next_win_idx" ON "matches" USING btree ("next_match_win_id");--> statement-breakpoint
CREATE INDEX "matches_next_lose_idx" ON "matches" USING btree ("next_match_lose_id");--> statement-breakpoint
CREATE INDEX "players_league_idx" ON "players" USING btree ("league_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_league_token_idx" ON "players" USING btree ("league_token");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_event_side_number_idx" ON "rounds" USING btree ("event_id","bracket_side","round_number");