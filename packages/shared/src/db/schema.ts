import {
	pgTable,
	pgEnum,
	text,
	integer,
	bigint,
	boolean,
	timestamp,
	index,
	serial,
	varchar,
	uniqueIndex,
	jsonb,
} from 'drizzle-orm/pg-core'

export const marketTypeEnum = pgEnum('market_type', ['classic', 'counter', 'price', 'event'])

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
		marketType: marketTypeEnum('market_type').notNull().default('classic'),
		sourceConfig: jsonb('source_config').default('{}'),
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

export const comments = pgTable('comments', {
	id: serial('id').primaryKey(),
	marketAddress: varchar('market_address', { length: 42 }).notNull(),
	userAddress: varchar('user_address', { length: 42 }).notNull(),
	content: text('content').notNull(),
	createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (table) => [
	index('idx_comments_market').on(table.marketAddress),
])

export const userStats = pgTable('user_stats', {
	address: varchar('address', { length: 42 }).primaryKey(),
	totalBets: integer('total_bets').notNull().default(0),
	totalVolume: text('total_volume').notNull().default('0'),
	totalPnl: text('total_pnl').notNull().default('0'),
	wins: integer('wins').notNull().default(0),
	losses: integer('losses').notNull().default(0),
	lastActive: bigint('last_active', { mode: 'number' }).notNull().default(0),
})

export const marketStats = pgTable('market_stats', {
	marketAddress: varchar('market_address', { length: 42 }).primaryKey(),
	totalBettors: integer('total_bettors').notNull().default(0),
	largestBet: text('largest_bet').notNull().default('0'),
	volume24h: text('volume_24h').notNull().default('0'),
	bets24h: integer('bets_24h').notNull().default(0),
	momentum: varchar('momentum', { length: 16 }).notNull().default('neutral'),
})

export const counterState = pgTable('counter_state', {
	marketAddress: varchar('market_address', { length: 42 }).primaryKey(),
	currentCount: integer('current_count').notNull().default(0),
	ratePerHour: text('rate_per_hour').notNull().default('0'),
	projected: integer('projected').notNull().default(0),
	lastEventAt: bigint('last_event_at', { mode: 'number' }).notNull().default(0),
	timeline: jsonb('timeline').default('[]'),
})

export const notifications = pgTable('notifications', {
	id: serial('id').primaryKey(),
	userAddress: varchar('user_address', { length: 42 }).notNull(),
	type: varchar('type', { length: 32 }).notNull(),
	title: text('title').notNull(),
	body: text('body'),
	marketAddress: varchar('market_address', { length: 42 }),
	read: boolean('read').notNull().default(false),
	createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (table) => [
	index('idx_notifications_user').on(table.userAddress),
])
