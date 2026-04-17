-- Propose & Approve: community-driven market creation with fee-share incentive.
--
-- market_proposals: any wallet holder can propose a market for admin review.
-- proposer_payouts: tracks the proposer's share of each FeeWithdrawn event.
-- markets gets two new columns: proposer_address + fee_share_bps.

-- Proposal status enum
DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Proposals table
CREATE TABLE IF NOT EXISTS "market_proposals" (
  "id" serial PRIMARY KEY NOT NULL,
  "proposer_address" varchar(42) NOT NULL,
  "question" text NOT NULL,
  "labels" text[] NOT NULL,
  "deadline" bigint NOT NULL,
  "grace_period" bigint NOT NULL,
  "market_type" market_type DEFAULT 'classic' NOT NULL,
  "source_config" jsonb DEFAULT '{}',
  "rationale" text,
  "status" proposal_status DEFAULT 'pending' NOT NULL,
  "reject_reason" text,
  "market_address" varchar(42),
  "admin_notes" text,
  "created_at" bigint NOT NULL,
  "reviewed_at" bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_status" ON "market_proposals" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_proposer" ON "market_proposals" ("proposer_address");

-- Extend markets with proposer tracking
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "proposer_address" varchar(42);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "fee_share_bps" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_markets_proposer" ON "markets" ("proposer_address");

-- Proposer payouts — one row per FeeWithdrawn event on a proposer-created market
CREATE TABLE IF NOT EXISTS "proposer_payouts" (
  "id" serial PRIMARY KEY NOT NULL,
  "proposer_address" varchar(42) NOT NULL,
  "market_address" varchar(42) NOT NULL,
  "fee_event_id" integer NOT NULL,
  "fee_amount" text NOT NULL,
  "proposer_share" text NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "payout_tx_hash" varchar(66),
  "created_at" bigint NOT NULL,
  "paid_at" bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payouts_proposer" ON "proposer_payouts" ("proposer_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payouts_status" ON "proposer_payouts" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payouts_fee_event" ON "proposer_payouts" ("fee_event_id");
--> statement-breakpoint
ALTER TABLE "proposer_payouts"
  ADD CONSTRAINT "fk_payouts_fee"
  FOREIGN KEY ("fee_event_id") REFERENCES "fees" ("id")
  ON DELETE CASCADE
  NOT VALID;
--> statement-breakpoint
ALTER TABLE "proposer_payouts"
  ADD CONSTRAINT "fk_payouts_market"
  FOREIGN KEY ("market_address") REFERENCES "markets" ("address")
  ON DELETE CASCADE
  NOT VALID;
