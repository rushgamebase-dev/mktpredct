-- Adds a composite index on (block_number, log_index) for chart/activity
-- queries that sort by chain ordering, and a FK from bets → markets so orphan
-- rows can't accumulate after a rollback. FK is DEFERRABLE INITIALLY DEFERRED
-- so inserts within a transaction that also inserts the market succeed.

-- Drop the FK if it exists (idempotent for local re-runs)
ALTER TABLE "bets" DROP CONSTRAINT IF EXISTS "fk_bets_market";
ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "fk_claims_market";
ALTER TABLE "fees" DROP CONSTRAINT IF EXISTS "fk_fees_market";

CREATE INDEX IF NOT EXISTS "idx_bets_block_log" ON "bets" ("block_number", "log_index");

ALTER TABLE "bets"
	ADD CONSTRAINT "fk_bets_market"
	FOREIGN KEY ("market_address") REFERENCES "markets" ("address")
	ON DELETE CASCADE
	DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "claims"
	ADD CONSTRAINT "fk_claims_market"
	FOREIGN KEY ("market_address") REFERENCES "markets" ("address")
	ON DELETE CASCADE
	DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "fees"
	ADD CONSTRAINT "fk_fees_market"
	FOREIGN KEY ("market_address") REFERENCES "markets" ("address")
	ON DELETE CASCADE
	DEFERRABLE INITIALLY DEFERRED;

-- Reorg detection: persist the hash of the last safe block per sync key. When
-- the next tick starts, the indexer compares getBlock(lastBlock).hash to this
-- value; if they differ, it rolls rows back to the divergence point.
ALTER TABLE "sync_state" ADD COLUMN IF NOT EXISTS "last_block_hash" varchar(66);
