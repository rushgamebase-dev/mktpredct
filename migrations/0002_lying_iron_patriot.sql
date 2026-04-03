CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_address" varchar(42) NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"content" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counter_state" (
	"market_address" varchar(42) PRIMARY KEY NOT NULL,
	"current_count" integer DEFAULT 0 NOT NULL,
	"rate_per_hour" text DEFAULT '0' NOT NULL,
	"projected" integer DEFAULT 0 NOT NULL,
	"last_event_at" bigint DEFAULT 0 NOT NULL,
	"timeline" jsonb DEFAULT '[]'
);
--> statement-breakpoint
CREATE TABLE "market_stats" (
	"market_address" varchar(42) PRIMARY KEY NOT NULL,
	"total_bettors" integer DEFAULT 0 NOT NULL,
	"largest_bet" text DEFAULT '0' NOT NULL,
	"volume_24h" text DEFAULT '0' NOT NULL,
	"bets_24h" integer DEFAULT 0 NOT NULL,
	"momentum" varchar(16) DEFAULT 'neutral' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"type" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"market_address" varchar(42),
	"read" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"address" varchar(42) PRIMARY KEY NOT NULL,
	"total_bets" integer DEFAULT 0 NOT NULL,
	"total_volume" text DEFAULT '0' NOT NULL,
	"total_pnl" text DEFAULT '0' NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"last_active" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_comments_market" ON "comments" USING btree ("market_address");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_address");