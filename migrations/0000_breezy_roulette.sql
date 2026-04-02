CREATE TABLE "bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_address" varchar(42) NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"outcome_index" integer NOT NULL,
	"amount" text NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_address" varchar(42) NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"payout" text NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fees" (
	"id" serial PRIMARY KEY NOT NULL,
	"market_address" varchar(42) NOT NULL,
	"amount" text NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"address" varchar(42) PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"outcome_count" integer NOT NULL,
	"labels" text[] NOT NULL,
	"deadline" bigint NOT NULL,
	"grace_period" bigint NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"winning_outcome" integer,
	"total_pool" text DEFAULT '0' NOT NULL,
	"total_per_outcome" text[] NOT NULL,
	"fee_bps" integer NOT NULL,
	"fee_recipient" varchar(42) NOT NULL,
	"signer_address" varchar(42) NOT NULL,
	"created_at" bigint NOT NULL,
	"resolved_at" bigint,
	"created_block" bigint NOT NULL,
	"created_tx_hash" varchar(66) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"last_timestamp" bigint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_bets_market" ON "bets" USING btree ("market_address");--> statement-breakpoint
CREATE INDEX "idx_bets_user" ON "bets" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "idx_bets_market_user" ON "bets" USING btree ("market_address","user_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bets_tx_log" ON "bets" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "idx_claims_market" ON "claims" USING btree ("market_address");--> statement-breakpoint
CREATE INDEX "idx_claims_user" ON "claims" USING btree ("user_address");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_claims_tx_log" ON "claims" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fees_tx_log" ON "fees" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "idx_markets_status" ON "markets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_markets_deadline" ON "markets" USING btree ("deadline");