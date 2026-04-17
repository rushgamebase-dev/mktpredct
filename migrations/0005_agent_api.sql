-- Agent API: let autonomous agents propose markets via API key.

CREATE TABLE IF NOT EXISTS "agents" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "key_hash" varchar(64) NOT NULL,
  "wallet_address" varchar(42) NOT NULL,
  "rate_limit_per_hour" integer DEFAULT 10 NOT NULL,
  "fee_share_bps" integer DEFAULT 8000 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" bigint NOT NULL,
  "last_used_at" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_agents_key_hash" ON "agents" ("key_hash");

-- Track which proposals came from agents
ALTER TABLE "market_proposals" ADD COLUMN IF NOT EXISTS "agent_id" integer;
