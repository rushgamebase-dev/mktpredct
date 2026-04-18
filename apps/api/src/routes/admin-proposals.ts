import { Hono } from 'hono'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { isAddress, parseEventLogs } from 'viem'
import { MarketFactoryABI } from '@rush/shared'
import type {
	AdminMarketProposal,
	AdminProposalsListResponse,
	ApprovalChecklist,
	ApproveProposalRequest,
	ApproveProposalResponse,
	RejectProposalRequest,
	ProposerPayoutsResponse,
	ProposerPayoutSummary,
} from '@rush/shared'
import { adminAuth } from '../middleware/auth.js'
import { generateAgentKey } from '../middleware/agent-auth.js'
import { walletClient, publicClient } from '../services/chain.js'
import { env } from '../env.js'
import { db } from '../db.js'
import { agents, markets, marketProposals, proposerPayouts, washFlags, platformControls } from '@rush/shared/db/schema'
import { broadcast } from '../ws/broadcast.js'

// feeShareBps is applied to the collected fee amount (5% of pool), not the
// pool itself. 80% of that fee = 8000 bps → proposer receives 4% of the pool.
const DEFAULT_FEE_SHARE_BPS = 8000

const app = new Hono()
app.use('/*', adminAuth)

// GET /api/admin/proposals — full proposal listing for the admin review UI.
// Unlike the public /api/proposals route, this returns resolutionCriteria,
// tosAcceptedAt, agentId and other fields the admin needs before approving.
app.get('/', async (c) => {
	const page = Math.max(1, Number(c.req.query('page') || '1'))
	const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') || '50')))
	const status = c.req.query('status') || 'pending'
	const offset = (page - 1) * pageSize

	const filter = status !== 'all' && ['pending', 'approved', 'rejected'].includes(status)
		? eq(marketProposals.status, status as 'pending' | 'approved' | 'rejected')
		: undefined

	const baseQuery = db.select().from(marketProposals)
	const baseCount = db.select({ total: count() }).from(marketProposals)
	const listQuery = filter ? baseQuery.where(filter) : baseQuery
	const countQuery = filter ? baseCount.where(filter) : baseCount

	const [rows, countResult] = await Promise.all([
		listQuery.orderBy(desc(marketProposals.createdAt)).limit(pageSize).offset(offset),
		countQuery,
	])

	const proposals: AdminMarketProposal[] = rows.map((row) => ({
		id: row.id,
		proposerAddress: row.proposerAddress,
		question: row.question,
		labels: row.labels as string[],
		deadline: row.deadline,
		gracePeriod: row.gracePeriod,
		marketType: (row.marketType ?? 'classic') as AdminMarketProposal['marketType'],
		sourceConfig: (row.sourceConfig as Record<string, unknown>) ?? null,
		rationale: row.rationale,
		status: row.status as AdminMarketProposal['status'],
		rejectReason: row.rejectReason,
		marketAddress: row.marketAddress,
		createdAt: row.createdAt,
		reviewedAt: row.reviewedAt,
		// admin-only fields
		resolutionCriteria: row.resolutionCriteria ?? '',
		agentId: row.agentId ?? null,
		tosAcceptedAt: row.tosAcceptedAt ?? null,
		tosVersion: row.tosVersion ?? null,
		conflictDeclared: row.conflictDeclared ?? null,
		conflictDetail: row.conflictDetail ?? null,
		approvalChecklist: (row.approvalChecklist as ApprovalChecklist | null) ?? null,
		reviewedBy: row.reviewedBy ?? null,
		adminNotes: row.adminNotes ?? null,
	}))

	const response: AdminProposalsListResponse = {
		proposals,
		total: countResult[0]?.total ?? 0,
		page,
		pageSize,
	}
	return c.json(response)
})

async function updateMarketAfterApprove(
	marketAddress: string,
	proposerAddress: string,
	feeShareBps: number,
	marketType: string,
	sourceConfig: unknown,
	resolutionCriteria: string,
): Promise<void> {
	const addr = marketAddress.toLowerCase()
	for (let i = 0; i < 10; i++) {
		try {
			const [row] = await db.select().from(markets).where(eq(markets.address, addr)).limit(1)
			if (row) {
				await db.update(markets).set({
					proposerAddress,
					feeShareBps,
					marketType: marketType as 'classic' | 'counter' | 'price' | 'event',
					sourceConfig: sourceConfig ?? {},
					resolutionCriteria,
				}).where(eq(markets.address, addr))
				console.log(`[admin-proposals] Market ${addr.slice(0, 10)}... metadata updated (proposer=${proposerAddress.slice(0, 10)}, share=${feeShareBps}bps)`)
				return
			}
		} catch (e: any) {
			console.warn(`[admin-proposals] Metadata update attempt ${i + 1} failed: ${e.message?.slice(0, 80)}`)
		}
		await new Promise((r) => setTimeout(r, 3000))
	}
	console.error(`[admin-proposals] Failed to update metadata for ${addr} after 10 retries`)
}

// POST /api/admin/proposals/:id/approve
app.post('/:id/approve', async (c) => {
	const id = Number(c.req.param('id'))
	if (!Number.isInteger(id) || id < 1) {
		return c.json({ error: 'Invalid proposal ID' }, 400)
	}

	const [proposal] = await db.select().from(marketProposals).where(eq(marketProposals.id, id)).limit(1)
	if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
	if (proposal.status !== 'pending') return c.json({ error: `Proposal already ${proposal.status}` }, 409)

	type ApproveBody = {
		feeShareBps?: number
		adminNotes?: string
		approvalChecklist?: { clarity: boolean; criteria: boolean; conflict: boolean; tos: boolean; source: boolean; legal: boolean }
	}
	const body: ApproveBody = await c.req.json<ApproveBody>().catch(() => ({}))

	const feeShareBps = body.feeShareBps ?? DEFAULT_FEE_SHARE_BPS
	if (feeShareBps < 0 || feeShareBps > 9500) {
		return c.json({ error: 'feeShareBps must be 0-9500 (protocol keeps at least 5%)' }, 400)
	}

	// Approval checklist: all 6 fields must be true
	const cl = body.approvalChecklist
	if (!cl || !cl.clarity || !cl.criteria || !cl.conflict || !cl.tos || !cl.source || !cl.legal) {
		return c.json({ error: 'approvalChecklist is required with all 6 fields set to true: clarity, criteria, conflict, tos, source, legal' }, 400)
	}

	// Resolution criteria must exist on the proposal
	if (!proposal.resolutionCriteria || proposal.resolutionCriteria.length < 20) {
		return c.json({ error: 'Cannot approve: proposal has no resolutionCriteria (min 20 chars)' }, 422)
	}

	// ToS must have been accepted (human proposals)
	if (!proposal.agentId && !proposal.tosAcceptedAt) {
		return c.json({ error: 'Cannot approve: proposer has not accepted ToS' }, 422)
	}

	const factoryAddress = env.FACTORY_ADDRESS as `0x${string}`

	// TX Safety: verify factory is a contract and simulate before sending
	const code = await publicClient.getCode({ address: factoryAddress })
	if (!code || code === '0x') {
		return c.json({ error: 'Factory contract not found at configured address' }, 500)
	}

	try {
		await publicClient.simulateContract({
			address: factoryAddress,
			abi: MarketFactoryABI,
			functionName: 'createMarket',
			args: [
				proposal.question,
				proposal.labels as string[],
				BigInt(proposal.deadline),
				BigInt(proposal.gracePeriod),
			],
			account: walletClient.account,
		})
	} catch (e: any) {
		const short = (e as { shortMessage?: string })?.shortMessage ?? e.message?.slice(0, 120)
		return c.json({ error: `Simulation failed: ${short}` }, 422)
	}

	const txHash = await walletClient.writeContract({
		address: factoryAddress,
		abi: MarketFactoryABI,
		functionName: 'createMarket',
		args: [
			proposal.question,
			proposal.labels as string[],
			BigInt(proposal.deadline),
			BigInt(proposal.gracePeriod),
		],
	})

	const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 })
	if (receipt.status === 'reverted') {
		return c.json({ error: 'createMarket reverted on-chain', txHash }, 422)
	}

	const parsed = parseEventLogs({
		abi: MarketFactoryABI,
		logs: receipt.logs,
		eventName: 'MarketCreated',
	})

	let marketAddress = ''
	if (parsed.length > 0) {
		marketAddress = (parsed[0].args as any).market
	}
	if (!marketAddress) {
		return c.json({ error: 'Market created on-chain but MarketCreated event not found in logs', txHash }, 500)
	}

	const now = Math.floor(Date.now() / 1000)
	await db.update(marketProposals).set({
		status: 'approved',
		marketAddress: marketAddress.toLowerCase(),
		adminNotes: body.adminNotes || null,
		approvalChecklist: cl,
		reviewedBy: 'admin',
		reviewedAt: now,
	}).where(eq(marketProposals.id, id))

	// Update market row with proposer info + resolutionCriteria — await so
	// fee-share metadata is written BEFORE the indexer processes FeeWithdrawn.
	await updateMarketAfterApprove(
		marketAddress,
		proposal.proposerAddress,
		feeShareBps,
		proposal.marketType ?? 'classic',
		proposal.sourceConfig,
		proposal.resolutionCriteria ?? '',
	)

	broadcast.emit('__global', {
		type: 'proposal_update',
		data: { proposalId: id, status: 'approved', marketAddress: marketAddress.toLowerCase() },
		marketAddress: marketAddress.toLowerCase(),
	})

	const response: ApproveProposalResponse = { txHash, marketAddress, proposalId: id }
	return c.json(response, 201)
})

// POST /api/admin/proposals/:id/reject
app.post('/:id/reject', async (c) => {
	const id = Number(c.req.param('id'))
	if (!Number.isInteger(id) || id < 1) {
		return c.json({ error: 'Invalid proposal ID' }, 400)
	}

	const [proposal] = await db.select().from(marketProposals).where(eq(marketProposals.id, id)).limit(1)
	if (!proposal) return c.json({ error: 'Proposal not found' }, 404)
	if (proposal.status !== 'pending') return c.json({ error: `Proposal already ${proposal.status}` }, 409)

	const body = await c.req.json<RejectProposalRequest>()
	if (!body.reason || body.reason.length < 10 || body.reason.length > 500) {
		return c.json({ error: 'reason is required (10-500 chars)' }, 400)
	}

	const now = Math.floor(Date.now() / 1000)
	await db.update(marketProposals).set({
		status: 'rejected',
		rejectReason: body.reason.trim(),
		adminNotes: body.adminNotes || null,
		reviewedAt: now,
	}).where(eq(marketProposals.id, id))

	broadcast.emit('__global', {
		type: 'proposal_update',
		data: { proposalId: id, status: 'rejected', marketAddress: null },
		marketAddress: '',
	})

	return c.json({ success: true, proposalId: id })
})

// GET /api/admin/proposals/payouts
app.get('/payouts', async (c) => {
	const rows = await db
		.select({
			proposerAddress: proposerPayouts.proposerAddress,
			totalOwed: sql<string>`CAST(SUM(CASE WHEN ${proposerPayouts.status} = 'pending' THEN CAST(${proposerPayouts.proposerShare} AS NUMERIC) ELSE 0 END) AS TEXT)`,
			totalPaid: sql<string>`CAST(SUM(CASE WHEN ${proposerPayouts.status} = 'paid' THEN CAST(${proposerPayouts.proposerShare} AS NUMERIC) ELSE 0 END) AS TEXT)`,
			pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${proposerPayouts.status} = 'pending')`,
		})
		.from(proposerPayouts)
		.groupBy(proposerPayouts.proposerAddress)

	const summaries: ProposerPayoutSummary[] = rows.map((r) => ({
		proposerAddress: r.proposerAddress,
		totalOwed: r.totalOwed ?? '0',
		totalPaid: r.totalPaid ?? '0',
		pendingCount: r.pendingCount ?? 0,
	}))

	const response: ProposerPayoutsResponse = { summaries }
	return c.json(response)
})

// POST /api/admin/proposals/payouts/send
app.post('/payouts/send', async (c) => {
	const body = await c.req.json<{ proposerAddress: string; amount: string }>()

	if (!body.proposerAddress || !body.amount) {
		return c.json({ error: 'proposerAddress and amount are required' }, 400)
	}
	if (!isAddress(body.proposerAddress)) {
		return c.json({ error: 'Invalid proposerAddress' }, 400)
	}

	const addr = body.proposerAddress.toLowerCase() as `0x${string}`
	const amount = BigInt(body.amount)
	if (amount <= 0n) {
		return c.json({ error: 'amount must be positive' }, 400)
	}

	// Check platform pause
	const [pauseCtrl] = await db.select().from(platformControls).where(eq(platformControls.key, 'payouts_paused')).limit(1)
	if (pauseCtrl?.value) {
		return c.json({ error: 'Payouts are temporarily paused' }, 503)
	}

	// Check for unresolved high-severity wash flags on any market of this proposer
	const [highFlags] = await db
		.select({ ct: sql<number>`COUNT(*)` })
		.from(washFlags)
		.where(and(
			eq(washFlags.suspectAddress, addr),
			eq(washFlags.severity, 'high'),
			eq(washFlags.dismissed, false),
		))
	if ((highFlags?.ct ?? 0) > 0) {
		return c.json({ error: 'Payout blocked: unresolved high-severity wash trading flags exist for this address. Review in /api/admin/controls/flags' }, 403)
	}

	// Only count PENDING + minimumPoolMet payouts
	const [pending] = await db
		.select({
			total: sql<string>`CAST(COALESCE(SUM(CAST(${proposerPayouts.proposerShare} AS NUMERIC)), 0) AS TEXT)`,
		})
		.from(proposerPayouts)
		.where(and(eq(proposerPayouts.proposerAddress, addr), eq(proposerPayouts.status, 'pending'), eq(proposerPayouts.minimumPoolMet, true)))

	const totalPending = BigInt(pending?.total ?? '0')
	if (totalPending < amount) {
		return c.json({ error: `Pending balance (${totalPending}) < requested amount (${amount})` }, 400)
	}

	const txHash = await walletClient.sendTransaction({
		to: addr,
		value: amount,
	})

	const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 })
	if (receipt.status === 'reverted') {
		return c.json({ error: 'ETH transfer reverted', txHash }, 422)
	}

	// Only mark PENDING payouts as paid
	const now = Math.floor(Date.now() / 1000)
	await db.update(proposerPayouts).set({
		status: 'paid',
		payoutTxHash: txHash,
		paidAt: now,
	}).where(and(eq(proposerPayouts.proposerAddress, addr), eq(proposerPayouts.status, 'pending')))

	console.log(`[admin-proposals] Paid ${amount} wei to ${addr} | tx=${txHash}`)
	return c.json({ txHash, proposerAddress: addr, amount: amount.toString() })
})

// POST /api/admin/proposals/agents — register a new agent
app.post('/agents', async (c) => {
	const body = await c.req.json<{ name: string; walletAddress: string; rateLimitPerHour?: number; feeShareBps?: number }>()

	if (!body.name || body.name.length < 1 || body.name.length > 255) {
		return c.json({ error: 'name is required (1-255 chars)' }, 400)
	}
	if (!body.walletAddress || !isAddress(body.walletAddress)) {
		return c.json({ error: 'Valid walletAddress is required' }, 400)
	}

	const { raw, hash } = generateAgentKey()
	const now = Math.floor(Date.now() / 1000)

	const [agent] = await db.insert(agents).values({
		name: body.name.trim(),
		keyHash: hash,
		walletAddress: body.walletAddress.toLowerCase(),
		rateLimitPerHour: body.rateLimitPerHour ?? 10,
		feeShareBps: body.feeShareBps ?? 8000,
		createdAt: now,
	}).returning()

	console.log(`[Admin] Agent registered: "${agent.name}" id=${agent.id} wallet=${agent.walletAddress.slice(0, 10)}`)

	return c.json({
		agent: {
			id: agent.id,
			name: agent.name,
			walletAddress: agent.walletAddress,
			rateLimitPerHour: agent.rateLimitPerHour,
			feeShareBps: agent.feeShareBps,
		},
		// API key shown ONCE — cannot be retrieved later
		apiKey: raw,
	}, 201)
})

// GET /api/admin/proposals/agents — list all agents
app.get('/agents', async (c) => {
	const rows = await db.select({
		id: agents.id,
		name: agents.name,
		walletAddress: agents.walletAddress,
		rateLimitPerHour: agents.rateLimitPerHour,
		feeShareBps: agents.feeShareBps,
		isActive: agents.isActive,
		createdAt: agents.createdAt,
		lastUsedAt: agents.lastUsedAt,
	}).from(agents)

	return c.json({ agents: rows })
})

export default app
