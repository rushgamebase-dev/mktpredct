import {
	pgTable,
	text,
	integer,
	bigint,
	boolean,
	timestamp,
	index,
	serial,
	varchar,
	uniqueIndex,
} from 'drizzle-orm/pg-core'

export const markets = pgTable(
	'markets',
	{
		address: varchar('address', { length: 42 }).primaryKey(),
		question: text('question').notNull(),
		outcomeCount: integer('outcome_count').notNull(),
		labels: text('labels').array().notNull(),
		deadline: bigint('deadline', { mode: 'number' }).notNull(),
		gracePeriod: bigint('grace_period', { mode: 'number' }).notNull(),
		status: varchar('status', { length: 16 }).notNull().default('open'),
		winningOutcome: integer('winning_outcome'),
		totalPool: text('total_pool').notNull().default('0'),
		totalPerOutcome: text('total_per_outcome').array().notNull(),
		feeBps: integer('fee_bps').notNull(),
		feeRecipient: varchar('fee_recipient', { length: 42 }).notNull(),
		signerAddress: varchar('signer_address', { length: 42 }).notNull(),
		createdAt: bigint('created_at', { mode: 'number' }).notNull(),
		resolvedAt: bigint('resolved_at', { mode: 'number' }),
		createdBlock: bigint('created_block', { mode: 'number' }).notNull(),
		createdTxHash: varchar('created_tx_hash', { length: 66 }).notNull(),
	},
	(table) => [
		index('idx_markets_status').on(table.status),
		index('idx_markets_deadline').on(table.deadline),
	],
)

export const bets = pgTable(
	'bets',
	{
		id: serial('id').primaryKey(),
		marketAddress: varchar('market_address', { length: 42 }).notNull(),
		user: varchar('user_address', { length: 42 }).notNull(),
		outcomeIndex: integer('outcome_index').notNull(),
		amount: text('amount').notNull(),
		txHash: varchar('tx_hash', { length: 66 }).notNull(),
		blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
		logIndex: integer('log_index').notNull(),
		timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
	},
	(table) => [
		index('idx_bets_market').on(table.marketAddress),
		index('idx_bets_user').on(table.user),
		index('idx_bets_market_user').on(table.marketAddress, table.user),
		uniqueIndex('idx_bets_tx_log').on(table.txHash, table.logIndex),
	],
)

export const claims = pgTable(
	'claims',
	{
		id: serial('id').primaryKey(),
		marketAddress: varchar('market_address', { length: 42 }).notNull(),
		user: varchar('user_address', { length: 42 }).notNull(),
		payout: text('payout').notNull(),
		txHash: varchar('tx_hash', { length: 66 }).notNull(),
		blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
		logIndex: integer('log_index').notNull(),
		timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
	},
	(table) => [
		index('idx_claims_market').on(table.marketAddress),
		index('idx_claims_user').on(table.user),
		uniqueIndex('idx_claims_tx_log').on(table.txHash, table.logIndex),
	],
)

export const fees = pgTable(
	'fees',
	{
		id: serial('id').primaryKey(),
		marketAddress: varchar('market_address', { length: 42 }).notNull(),
		amount: text('amount').notNull(),
		txHash: varchar('tx_hash', { length: 66 }).notNull(),
		blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
		logIndex: integer('log_index').notNull(),
		timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
	},
	(table) => [uniqueIndex('idx_fees_tx_log').on(table.txHash, table.logIndex)],
)

export const syncState = pgTable('sync_state', {
	key: varchar('key', { length: 64 }).primaryKey(),
	lastBlock: bigint('last_block', { mode: 'number' }).notNull(),
	lastTimestamp: bigint('last_timestamp', { mode: 'number' }).notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
