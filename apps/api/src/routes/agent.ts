import { Hono } from 'hono'
import { eq, and, count } from 'drizzle-orm'
import { agents, marketProposals } from '@rush/shared/db/schema'
import type { MarketProposal } from '@rush/shared'
import { db } from '../db.js'
import { agentAuth } from '../middleware/agent-auth.js'
import { rateLimitByKey } from '../middleware/rate-limit.js'

type AgentRow = typeof agents.$inferSelect
type AgentVars = { Variables: { agent: AgentRow } }

const VALID_MARKET_TYPES = new Set(['classic', 'counter', 'price', 'event'])
const MAX_QUESTION_LEN = 200
const MAX_LABEL_LEN = 50
const MAX_RATIONALE_LEN = 1000
const MAX_DEADLINE_DAYS = 90

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
		adminNotes: null,
		createdAt: row.createdAt,
		reviewedAt: row.reviewedAt,
	}
}

const app = new Hono<AgentVars>()

// All agent routes require Bearer token auth
app.use('/*', agentAuth as any)

// Per-agent rate limit (uses agent ID from context)
const perAgentLimit = rateLimitByKey(10, 10 / 3600, async (c: any) => {
	const agent = c.get('agent') as AgentRow | undefined
	return agent ? `agent:${agent.id}` : null
})

// POST /api/agent/proposals — create a proposal as an agent
app.post('/proposals', perAgentLimit as any, async (c) => {
	const agent = c.get('agent')

	const body = await c.req.json<{
		question: string
		labels: string[]
		deadline: number
		gracePeriod?: number
		marketType?: string
		sourceConfig?: Record<string, unknown>
		rationale?: string
	}>()

	// Validation — same rules as human proposals
	if (!body.question || body.question.length < 3 || body.question.length > MAX_QUESTION_LEN) {
		return c.json({ code: 'INVALID_QUESTION', detail: `Question must be 3-${MAX_QUESTION_LEN} characters` }, 400)
	}
	if (!Array.isArray(body.labels) || body.labels.length < 2 || body.labels.length > 10) {
		return c.json({ code: 'INVALID_LABELS', detail: 'Need 2-10 outcome labels' }, 400)
	}
	if (body.labels.some((l: string) => !l || l.length > MAX_LABEL_LEN)) {
		return c.json({ code: 'INVALID_LABEL_LENGTH', detail: `Each label must be 1-${MAX_LABEL_LEN} characters` }, 400)
	}
	if (!body.deadline || typeof body.deadline !== 'number') {
		return c.json({ code: 'MISSING_DEADLINE', detail: 'deadline is required (unix timestamp)' }, 400)
	}
	const now = Math.floor(Date.now() / 1000)
	if (body.deadline <= now) {
		return c.json({ code: 'DEADLINE_IN_PAST', detail: 'deadline must be in the future' }, 400)
	}
	if (body.deadline > now + MAX_DEADLINE_DAYS * 86400) {
		return c.json({ code: 'DEADLINE_TOO_FAR', detail: `deadline must be within ${MAX_DEADLINE_DAYS} days` }, 400)
	}
	const gracePeriod = body.gracePeriod ?? 604800
	if (gracePeriod < 86400 || gracePeriod > 2592000) {
		return c.json({ code: 'INVALID_GRACE_PERIOD', detail: 'gracePeriod must be 1-30 days in seconds' }, 400)
	}
	if (body.marketType && !VALID_MARKET_TYPES.has(body.marketType)) {
		return c.json({ code: 'INVALID_MARKET_TYPE', detail: `Must be one of: ${[...VALID_MARKET_TYPES].join(', ')}` }, 400)
	}
	if (body.rationale && body.rationale.length > MAX_RATIONALE_LEN) {
		return c.json({ code: 'RATIONALE_TOO_LONG', detail: `Rationale max ${MAX_RATIONALE_LEN} characters` }, 400)
	}

	const [inserted] = await db
		.insert(marketProposals)
		.values({
			proposerAddress: agent.walletAddress.toLowerCase(),
			question: body.question.trim(),
			labels: body.labels.map((l: string) => l.trim()),
			deadline: body.deadline,
			gracePeriod,
			marketType: (body.marketType as 'classic' | 'counter' | 'price' | 'event') ?? 'classic',
			sourceConfig: body.sourceConfig ?? {},
			rationale: body.rationale?.trim() || null,
			agentId: agent.id,
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

	console.log(`[Agent] Proposal #${inserted.id} by agent "${agent.name}" (${agent.walletAddress.slice(0, 10)})`)

	return c.json(toProposal(inserted), 201)
})

// GET /api/agent/proposals — list this agent's proposals
app.get('/proposals', async (c) => {
	const agent = c.get('agent')
	const page = Math.max(1, Number(c.req.query('page') || '1'))
	const pageSize = Math.min(50, Math.max(1, Number(c.req.query('pageSize') || '20')))
	const status = c.req.query('status') || 'all'
	const offset = (page - 1) * pageSize

	const conditions = [eq(marketProposals.proposerAddress, agent.walletAddress.toLowerCase())]
	if (status !== 'all' && ['pending', 'approved', 'rejected'].includes(status)) {
		conditions.push(eq(marketProposals.status, status as 'pending' | 'approved' | 'rejected'))
	}
	const filter = and(...conditions)

	const [rows, countResult] = await Promise.all([
		db.select().from(marketProposals).where(filter).limit(pageSize).offset(offset),
		db.select({ total: count() }).from(marketProposals).where(filter),
	])

	return c.json({
		proposals: rows.map(toProposal),
		total: countResult[0]?.total ?? 0,
		page,
		pageSize,
	})
})

export default app
