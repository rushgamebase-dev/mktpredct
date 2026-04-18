-- Safety features: resolution criteria, ToS, conflict of interest, approval
-- checklist, wash trading detection, platform controls, dispute handling,
-- minimum pool threshold for fee-share payout.

-- ==========================================================================
-- 1. market_proposals: new columns for safety
-- ==========================================================================

ALTER TABLE "market_proposals"
  ADD COLUMN IF NOT EXISTS "resolution_criteria" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tos_accepted_at" bigint,
  ADD COLUMN IF NOT EXISTS "tos_version" varchar(16),
  ADD COLUMN IF NOT EXISTS "conflict_declared" boolean,
  ADD COLUMN IF NOT EXISTS "conflict_detail" text,
  ADD COLUMN IF NOT EXISTS "ip_hash" varchar(64),
  ADD COLUMN IF NOT EXISTS "approval_checklist" jsonb,
  ADD COLUMN IF NOT EXISTS "reviewed_by" varchar(42);

-- ==========================================================================
-- 2. markets: resolution criteria + dispute + min pool
-- ==========================================================================

ALTER TABLE "markets"
  ADD COLUMN IF NOT EXISTS "resolution_criteria" text,
  ADD COLUMN IF NOT EXISTS "min_pool_for_fee_share" text NOT NULL DEFAULT '10000000000000000',
  ADD COLUMN IF NOT EXISTS "dispute_flag" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dispute_reason" text,
  ADD COLUMN IF NOT EXISTS "disputed_at" bigint,
  ADD COLUMN IF NOT EXISTS "disputed_by" varchar(42);

-- ==========================================================================
-- 3. proposer_payouts: minimum pool met flag
-- ==========================================================================

ALTER TABLE "proposer_payouts"
  ADD COLUMN IF NOT EXISTS "minimum_pool_met" boolean NOT NULL DEFAULT false;

-- ==========================================================================
-- 4. Payout status enum (replace varchar with controlled values)
-- ==========================================================================

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('pending', 'paid', 'blocked', 'disputed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Note: we keep proposer_payouts.status as varchar for now because ALTER
-- COLUMN ... TYPE with enum requires casting existing rows. The application
-- layer validates the values. Converting to enum is a follow-up migration.

-- ==========================================================================
-- 5. ToS acceptances table
-- ==========================================================================

CREATE TABLE IF NOT EXISTS "tos_acceptances" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_address" varchar(42) NOT NULL,
  "tos_version" varchar(16) NOT NULL,
  "accepted_at" bigint NOT NULL,
  "ip_hash" varchar(64),
  "signature" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tos_user_version"
  ON "tos_acceptances" ("user_address", "tos_version");

-- ==========================================================================
-- 6. Wash trading flags table
-- ==========================================================================

CREATE TABLE IF NOT EXISTS "wash_flags" (
  "id" serial PRIMARY KEY NOT NULL,
  "market_address" varchar(42) NOT NULL,
  "suspect_address" varchar(42) NOT NULL,
  "reason" varchar(64) NOT NULL,
  "detail" jsonb,
  "severity" varchar(16) NOT NULL,
  "created_at" bigint NOT NULL,
  "reviewed_at" bigint,
  "reviewed_by" varchar(42),
  "dismissed" boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wash_flags_market"
  ON "wash_flags" ("market_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wash_flags_severity"
  ON "wash_flags" ("severity");

-- ==========================================================================
-- 7. Platform controls table (pause/emergency toggles)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS "platform_controls" (
  "key" varchar(64) PRIMARY KEY NOT NULL,
  "value" boolean NOT NULL DEFAULT false,
  "reason" text,
  "updated_at" bigint NOT NULL,
  "updated_by" varchar(42) NOT NULL
);

-- Seed default controls
INSERT INTO "platform_controls" ("key", "value", "updated_at", "updated_by")
VALUES
  ('proposals_paused', false, extract(epoch from now()), 'system'),
  ('payouts_paused', false, extract(epoch from now()), 'system')
ON CONFLICT ("key") DO NOTHING;
