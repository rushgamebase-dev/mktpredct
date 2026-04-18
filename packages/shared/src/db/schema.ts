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
export const proposalStatusEnum = pgEnum('proposal_status', ['pending', 'approved', 'rejected'])

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
		proposerAddress: varchar('proposer_address', { length: 42 }),
		feeShareBps: integer('fee_share_bps').notNull().default(0),
		resolutionCriteria: text('resolution_criteria'),
		minPoolForFeeShare: text('min_pool_for_fee_share').notNull().default('10000000000000000'),
		disputeFlag: boolean('dispute_flag').notNull().default(false),
		disputeReason: text('dispute_reason'),
		disputedAt: bigint('disputed_at', { mode: 'number' }),
		disputedBy: varchar('disputed_by', { length: 42 }),
	},
	(table) => [
		index('idx_markets_status').on(table.status),
		index('idx_markets_deadline').on(table.deadline),
		index('idx_markets_proposer').on(table.proposerAddress),
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
		index('idx_bets_block_log').on(table.blockNumber, table.logIndex),
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
	// Hash of lastBlock at the time it was recorded — used for reorg detection.
	// Nullable: legacy rows before the feature was introduced have no hash.
	lastBlockHash: varchar('last_block_hash', { length: 66 }),
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

export const marketProposals = pgTable('market_proposals', {
	id: serial('id').primaryKey(),
	proposerAddress: varchar('proposer_address', { length: 42 }).notNull(),
	question: text('question').notNull(),
	labels: text('labels').array().notNull(),
	deadline: bigint('deadline', { mode: 'number' }).notNull(),
	gracePeriod: bigint('grace_period', { mode: 'number' }).notNull(),
	marketType: marketTypeEnum('market_type').notNull().default('classic'),
	sourceConfig: jsonb('source_config').default('{}'),
	rationale: text('rationale'),
	resolutionCriteria: text('resolution_criteria').notNull().default(''),
	status: proposalStatusEnum('status').notNull().default('pending'),
	rejectReason: text('reject_reason'),
	marketAddress: varchar('market_address', { length: 42 }),
	adminNotes: text('admin_notes'),
	agentId: integer('agent_id'),
	tosAcceptedAt: bigint('tos_accepted_at', { mode: 'number' }),
	tosVersion: varchar('tos_version', { length: 16 }),
	conflictDeclared: boolean('conflict_declared'),
	conflictDetail: text('conflict_detail'),
	ipHash: varchar('ip_hash', { length: 64 }),
	approvalChecklist: jsonb('approval_checklist'),
	reviewedBy: varchar('reviewed_by', { length: 42 }),
	createdAt: bigint('created_at', { mode: 'number' }).notNull(),
	reviewedAt: bigint('reviewed_at', { mode: 'number' }),
}, (table) => [
	index('idx_proposals_status').on(table.status),
	index('idx_proposals_proposer').on(table.proposerAddress),
])

export const agents = pgTable('agents', {
	id: serial('id').primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	keyHash: varchar('key_hash', { length: 64 }).notNull(),
	walletAddress: varchar('wallet_address', { length: 42 }).notNull(),
	rateLimitPerHour: integer('rate_limit_per_hour').notNull().default(10),
	feeShareBps: integer('fee_share_bps').notNull().default(8000),
	isActive: boolean('is_active').notNull().default(true),
	createdAt: bigint('created_at', { mode: 'number' }).notNull(),
	lastUsedAt: bigint('last_used_at', { mode: 'number' }),
}, (table) => [
	uniqueIndex('idx_agents_key_hash').on(table.keyHash),
])

export const proposerPayouts = pgTable('proposer_payouts', {
	id: serial('id').primaryKey(),
	proposerAddress: varchar('proposer_address', { length: 42 }).notNull(),
	marketAddress: varchar('market_address', { length: 42 }).notNull(),
	feeEventId: integer('fee_event_id').notNull(),
	feeAmount: text('fee_amount').notNull(),
	proposerShare: text('proposer_share').notNull(),
	status: varchar('status', { length: 16 }).notNull().default('pending'),
	minimumPoolMet: boolean('minimum_pool_met').notNull().default(false),
	payoutTxHash: varchar('payout_tx_hash', { length: 66 }),
	createdAt: bigint('created_at', { mode: 'number' }).notNull(),
	paidAt: bigint('paid_at', { mode: 'number' }),
}, (table) => [
	index('idx_payouts_proposer').on(table.proposerAddress),
	index('idx_payouts_status').on(table.status),
	uniqueIndex('idx_payouts_fee_event').on(table.feeEventId),
])

export const tosAcceptances = pgTable('tos_acceptances', {
	id: serial('id').primaryKey(),
	userAddress: varchar('user_address', { length: 42 }).notNull(),
	tosVersion: varchar('tos_version', { length: 16 }).notNull(),
	acceptedAt: bigint('accepted_at', { mode: 'number' }).notNull(),
	ipHash: varchar('ip_hash', { length: 64 }),
	signature: text('signature'),
}, (table) => [
	uniqueIndex('idx_tos_user_version').on(table.userAddress, table.tosVersion),
])

export const washFlags = pgTable('wash_flags', {
	id: serial('id').primaryKey(),
	marketAddress: varchar('market_address', { length: 42 }).notNull(),
	suspectAddress: varchar('suspect_address', { length: 42 }).notNull(),
	reason: varchar('reason', { length: 64 }).notNull(),
	detail: jsonb('detail'),
	severity: varchar('severity', { length: 16 }).notNull(),
	createdAt: bigint('created_at', { mode: 'number' }).notNull(),
	reviewedAt: bigint('reviewed_at', { mode: 'number' }),
	reviewedBy: varchar('reviewed_by', { length: 42 }),
	dismissed: boolean('dismissed').notNull().default(false),
}, (table) => [
	index('idx_wash_flags_market').on(table.marketAddress),
	index('idx_wash_flags_severity').on(table.severity),
])

export const platformControls = pgTable('platform_controls', {
	key: varchar('key', { length: 64 }).primaryKey(),
	value: boolean('value').notNull().default(false),
	reason: text('reason'),
	updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
	updatedBy: varchar('updated_by', { length: 42 }).notNull(),
})
