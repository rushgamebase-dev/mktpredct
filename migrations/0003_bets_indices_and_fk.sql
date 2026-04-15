-- Adds a composite index on (block_number, log_index) for chart/activity
-- queries that sort by chain ordering, and a FK from bets/claims/fees →
-- markets so orphan rows can't accumulate after a rollback.
--
-- PRODUCTION SAFETY:
-- The FKs are added as NOT VALID so this migration never blocks on
-- pre-existing orphan rows (e.g., bets indexed before the market row was
-- written by the factory-indexer, or residue from a previous crash). New
-- inserts are still validated. To validate historical rows later — after
-- confirming orphan counts are zero — run in a maintenance window:
--
--   SELECT COUNT(*) FROM bets b LEFT JOIN markets m
--     ON b.market_address = m.address WHERE m.address IS NULL;
--   -- repeat for claims, fees; clean up if needed
--   ALTER TABLE bets   VALIDATE CONSTRAINT fk_bets_market;
--   ALTER TABLE claims VALIDATE CONSTRAINT fk_claims_market;
--   ALTER TABLE fees   VALIDATE CONSTRAINT fk_fees_market;

ALTER TABLE "bets" DROP CONSTRAINT IF EXISTS "fk_bets_market";
ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "fk_claims_market";
ALTER TABLE "fees" DROP CONSTRAINT IF EXISTS "fk_fees_market";

CREATE INDEX IF NOT EXISTS "idx_bets_block_log" ON "bets" ("block_number", "log_index");

ALTER TABLE "bets"
	ADD CONSTRAINT "fk_bets_market"
	FOREIGN KEY ("market_address") REFERENCES "markets" ("address")
	ON DELETE CASCADE
	DEFERRABLE INITIALLY DEFERRED
	NOT VALID;

ALTER TABLE "claims"
	ADD CONSTRAINT "fk_claims_market"
	FOREIGN KEY ("market_address") REFERENCES "markets" ("address")
	ON DELETE CASCADE
	DEFERRABLE INITIALLY DEFERRED
	NOT VALID;

ALTER TABLE "fees"
	ADD CONSTRAINT "fk_fees_market"
	FOREIGN KEY ("market_address") REFERENCES "markets" ("address")
	ON DELETE CASCADE
	DEFERRABLE INITIALLY DEFERRED
	NOT VALID;

-- Reorg detection: persist the hash of the last safe block per sync key. When
-- the next tick starts, the indexer compares getBlock(lastBlock).hash to this
-- value; if they differ, it rolls rows back to the divergence point.
ALTER TABLE "sync_state" ADD COLUMN IF NOT EXISTS "last_block_hash" varchar(66);
