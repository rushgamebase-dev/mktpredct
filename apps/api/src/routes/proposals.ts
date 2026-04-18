import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { and, eq, desc, count, sql } from 'drizzle-orm'
import { verifyMessage, isAddress } from 'viem'
import { marketProposals, proposerPayouts, platformControls } from '@rush/shared/db/schema'
import type {
	CreateProposalRequest,
	MarketProposal,
	ProposalsListResponse,
	ProposerEarningsResponse,
} from '@rush/shared'
import { db } from '../db.js'
import { rateLimitByKey } from '../middleware/rate-limit.js'

const VALID_MARKET_TYPES = new Set(['classic', 'counter', 'price', 'event'])
const MAX_QUESTION_LEN = 200
const MAX_LABEL_LEN = 50
const MAX_RATIONALE_LEN = 1000
const MAX_DEADLINE_DAYS = 90
const MIN_RESOLUTION_CRITERIA_LEN = 20
const MAX_RESOLUTION_CRITERIA_LEN = 2000
const TOS_CURRENT_VERSION = '1.0'

const perWalletLimit = rateLimitByKey(3, 3 / 3600, async (c) => {
	try {
		const body = await c.req.json<{ proposerAddress?: string }>()
		return body.proposerAddress ?? null
	} catch {
		return null
	}
})

function toProposal(row: typeof marketProposals.$inferSelect): MarketProposal {
	return {
		id: row.id,
		proposerAddress: row.proposerAddress,
		question: row.question,
		labels: row.labels as string[],
		deadline: row.deadline,
		gracePeriod: row.gracePeriod,
		marketType: (row.marketType ?? 'classic') as MarketProposal['marketType'],
		sourceConfig: (row.sourceConfig as Record<string, unknown>) ?? null,
		rationale: row.rationale,
		status: row.status as MarketProposal['status'],
		rejectReason: row.rejectReason,
		marketAddress: row.marketAddress,
		adminNotes: null, // internal — never exposed on public routes
		createdAt: row.createdAt,
		reviewedAt: row.reviewedAt,
	}
}

const app = new Hono()

// GET /api/proposals
app.get('/', async (c) => {
	const page = Math.max(1, Number(c.req.query('page') || '1'))
	const pageSize = Math.min(50, Math.max(1, Number(c.req.query('pageSize') || '20')))
	const status = c.req.query('status') || 'all'
	const proposer = c.req.query('proposer')?.toLowerCase()
	const offset = (page - 1) * pageSize

	// Build filter conditions — use and() to combine (Drizzle .where() overwrites)
	const conditions = []
	if (status !== 'all' && ['pending', 'approved', 'rejected'].includes(status)) {
		conditions.push(eq(marketProposals.status, status as 'pending' | 'approved' | 'rejected'))
	}
	if (proposer && isAddress(proposer)) {
		conditions.push(eq(marketProposals.proposerAddress, proposer))
	}
	const filter = conditions.length > 0 ? and(...conditions) : undefined

	let query = db.select().from(marketProposals)
	let countQuery = db.select({ total: count() }).from(marketProposals)
	if (filter) {
		query = query.where(filter) as typeof query
		countQuery = countQuery.where(filter) as typeof countQuery
	}

	const [rows, countResult] = await Promise.all([
		query.orderBy(desc(marketProposals.createdAt)).limit(pageSize).offset(offset),
		countQuery,
	])

	const response: ProposalsListResponse = {
		proposals: rows.map(toProposal),
		total: countResult[0]?.total ?? 0,
		page,
		pageSize,
	}
	return c.json(response)
})

// GET /api/proposals/earnings/:address
app.get('/earnings/:address', async (c) => {
	const address = c.req.param('address').toLowerCase()
	if (!isAddress(address)) {
		return c.json({ error: 'Invalid address' }, 400)
	}

	const [proposalCounts] = await db
		.select({
			total: count(),
			approved: sql<number>`COUNT(*) FILTER (WHERE ${marketProposals.status} = 'approved')`,
		})
		.from(marketProposals)
		.where(eq(marketProposals.proposerAddress, address))

	const [payoutSums] = await db
		.select({
			totalPending: sql<string>`CAST(COALESCE(SUM(CASE WHEN ${proposerPayouts.status} = 'pending' THEN CAST(${proposerPayouts.proposerShare} AS NUMERIC) ELSE 0 END), 0) AS TEXT)`,
			totalPaid: sql<string>`CAST(COALESCE(SUM(CASE WHEN ${proposerPayouts.status} = 'paid' THEN CAST(${proposerPayouts.proposerShare} AS NUMERIC) ELSE 0 END), 0) AS TEXT)`,
		})
		.from(proposerPayouts)
		.where(eq(proposerPayouts.proposerAddress, address))

	const response: ProposerEarningsResponse = {
		proposerAddress: address,
		totalPending: payoutSums?.totalPending ?? '0',
		totalEarned: payoutSums?.totalPaid ?? '0',
		proposalsCount: proposalCounts?.total ?? 0,
		approvedCount: proposalCounts?.approved ?? 0,
	}
	return c.json(response)
})

// GET /api/proposals/:id
app.get('/:id', async (c) => {
	const id = Number(c.req.param('id'))
	if (!Number.isInteger(id) || id < 1) {
		return c.json({ error: 'Invalid proposal ID' }, 400)
	}

	const [row] = await db
		.select()
		.from(marketProposals)
		.where(eq(marketProposals.id, id))
		.limit(1)

	if (!row) {
		return c.json({ error: 'Proposal not found' }, 404)
	}

	return c.json(toProposal(row))
})

// POST /api/proposals
app.post('/', perWalletLimit, async (c) => {
	// Check platform pause
	const [pauseCtrl] = await db.select().from(platformControls).where(eq(platformControls.key, 'proposals_paused')).limit(1)
	if (pauseCtrl?.value) {
		return c.json({ error: 'Proposals are temporarily paused' }, 503)
	}

	const body = await c.req.json<CreateProposalRequest & {
		resolutionCriteria: string
		tosAcceptedAt: number
		tosVersion: string
		conflictDeclared: boolean
		conflictDetail?: string
	}>()

	// --- Existing validations ---
	if (!body.question || body.question.length < 3 || body.question.length > MAX_QUESTION_LEN) {
		return c.json({ error: `Question must be 3-${MAX_QUESTION_LEN} characters` }, 400)
	}
	if (!Array.isArray(body.labels) || body.labels.length < 2 || body.labels.length > 10) {
		return c.json({ error: 'Need 2-10 outcome labels' }, 400)
	}
	if (body.labels.some((l: string) => !l || l.length > MAX_LABEL_LEN)) {
		return c.json({ error: `Each label must be 1-${MAX_LABEL_LEN} characters` }, 400)
	}
	if (!body.deadline || typeof body.deadline !== 'number') {
		return c.json({ error: 'deadline is required (unix timestamp)' }, 400)
	}
	const now = Math.floor(Date.now() / 1000)
	if (body.deadline <= now + 3600) {
		return c.json({ error: 'deadline must be at least 1 hour in the future' }, 400)
	}
	if (body.deadline > now + MAX_DEADLINE_DAYS * 86400) {
		return c.json({ error: `deadline must be within ${MAX_DEADLINE_DAYS} days` }, 400)
	}
	const gracePeriod = body.gracePeriod ?? 604800
	if (gracePeriod < 86400 || gracePeriod > 2592000) {
		return c.json({ error: 'gracePeriod must be 1-30 days in seconds' }, 400)
	}
	if (body.marketType && !VALID_MARKET_TYPES.has(body.marketType)) {
		return c.json({ error: 'Invalid marketType' }, 400)
	}
	if (body.rationale && body.rationale.length > MAX_RATIONALE_LEN) {
		return c.json({ error: `Rationale max ${MAX_RATIONALE_LEN} characters` }, 400)
	}
	if (!body.proposerAddress || !isAddress(body.proposerAddress)) {
		return c.json({ error: 'Valid proposerAddress is required' }, 400)
	}
	if (!body.signature) {
		return c.json({ error: 'signature is required' }, 400)
	}
	if (!body.timestamp || typeof body.timestamp !== 'number') {
		return c.json({ error: 'timestamp is required' }, 400)
	}
	if (Math.abs(now - body.timestamp) > 300) {
		return c.json({ error: 'Signature expired (>5 min)' }, 401)
	}

	// --- Safety validations (NEW) ---

	// Resolution criteria: mandatory, 20-2000 chars
	if (!body.resolutionCriteria || body.resolutionCriteria.length < MIN_RESOLUTION_CRITERIA_LEN || body.resolutionCriteria.length > MAX_RESOLUTION_CRITERIA_LEN) {
		return c.json({ error: `resolutionCriteria is required (${MIN_RESOLUTION_CRITERIA_LEN}-${MAX_RESOLUTION_CRITERIA_LEN} chars). Describe how this market will be resolved.` }, 400)
	}

	// ToS acceptance: mandatory for human proposals
	if (!body.tosAcceptedAt || typeof body.tosAcceptedAt !== 'number') {
		return c.json({ error: 'tosAcceptedAt is required (unix timestamp of ToS acceptance)' }, 400)
	}
	if (Math.abs(now - body.tosAcceptedAt) > 600) {
		return c.json({ error: 'ToS acceptance expired (>10 min). Please re-accept.' }, 400)
	}
	if (body.tosVersion !== TOS_CURRENT_VERSION) {
		return c.json({ error: `tosVersion must be "${TOS_CURRENT_VERSION}"` }, 400)
	}

	// Conflict of interest: must be explicitly declared
	if (body.conflictDeclared === undefined || body.conflictDeclared === null) {
		return c.json({ error: 'conflictDeclared is required (true or false)' }, 400)
	}
	if (body.conflictDeclared && (!body.conflictDetail || body.conflictDetail.length < 10)) {
		return c.json({ error: 'conflictDetail is required when conflictDeclared is true (min 10 chars)' }, 400)
	}

	// --- Signature verification ---
	const message = `Rush Markets proposal:\n${body.question}\nby ${body.proposerAddress.toLowerCase()}\nat ${body.timestamp}`
	try {
		const valid = await verifyMessage({
			address: body.proposerAddress as `0x${string}`,
			message,
			signature: body.signature as `0x${string}`,
		})
		if (!valid) return c.json({ error: 'Invalid signature' }, 401)
	} catch {
		return c.json({ error: 'Invalid signature' }, 401)
	}

	// IP hash for audit trail
	const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
	const ipHash = createHash('sha256').update(ip).digest('hex')

	const [inserted] = await db
		.insert(marketProposals)
		.values({
			proposerAddress: body.proposerAddress.toLowerCase(),
			question: body.question.trim(),
			labels: body.labels.map((l: string) => l.trim()),
			deadline: body.deadline,
			gracePeriod,
			marketType: body.marketType ?? 'classic',
			sourceConfig: body.sourceConfig ?? {},
			rationale: body.rationale?.trim() || null,
			resolutionCriteria: body.resolutionCriteria.trim(),
			tosAcceptedAt: body.tosAcceptedAt,
			tosVersion: body.tosVersion,
			conflictDeclared: body.conflictDeclared,
			conflictDetail: body.conflictDeclared ? body.conflictDetail?.trim() || null : null,
			ipHash,
			createdAt: now,
		})
		.returning()

	// Broadcast to global WS feed
	try {
		const { broadcast } = await import('../ws/broadcast.js')
		broadcast.emit('__global', {
			type: 'proposal_update',
			data: { proposalId: inserted.id, status: 'pending', marketAddress: null },
			marketAddress: '',
		})
	} catch {}

	return c.json(toProposal(inserted), 201)
})

export default app
