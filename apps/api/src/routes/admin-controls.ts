import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { isAddress } from 'viem'
import { adminAuth } from '../middleware/auth.js'
import { db } from '../db.js'
import { markets, platformControls, washFlags, proposerPayouts } from '@rush/shared/db/schema'

const app = new Hono()
app.use('/*', adminAuth)

// ===================== Platform Controls =====================

// GET /api/admin/controls
app.get('/', async (c) => {
	const rows = await db.select().from(platformControls)
	return c.json({ controls: rows })
})

// POST /api/admin/controls
app.post('/', async (c) => {
	const body = await c.req.json<{ key: string; value: boolean; reason?: string }>()
	const validKeys = ['proposals_paused', 'payouts_paused']
	if (!validKeys.includes(body.key)) {
		return c.json({ error: `key must be one of: ${validKeys.join(', ')}` }, 400)
	}
	if (typeof body.value !== 'boolean') {
		return c.json({ error: 'value must be boolean' }, 400)
	}

	const now = Math.floor(Date.now() / 1000)
	await db.insert(platformControls).values({
		key: body.key,
		value: body.value,
		reason: body.reason || null,
		updatedAt: now,
		updatedBy: 'admin',
	}).onConflictDoUpdate({
		target: platformControls.key,
		set: { value: body.value, reason: body.reason || null, updatedAt: now, updatedBy: 'admin' },
	})

	console.log(`[Admin] Platform control: ${body.key}=${body.value} reason="${body.reason ?? ''}"`)
	return c.json({ success: true, key: body.key, value: body.value })
})

// ===================== Market Dispute =====================

// POST /api/admin/controls/dispute/:address
app.post('/dispute/:address', async (c) => {
	const rawAddr = c.req.param('address').toLowerCase()
	if (!isAddress(rawAddr)) return c.json({ error: 'Invalid address' }, 400)

	const body = await c.req.json<{ reason: string }>()
	if (!body.reason || body.reason.length < 5) {
		return c.json({ error: 'reason is required (min 5 chars)' }, 400)
	}

	const now = Math.floor(Date.now() / 1000)
	await db.update(markets).set({
		disputeFlag: true,
		disputeReason: body.reason.trim(),
		disputedAt: now,
		disputedBy: 'admin',
	}).where(eq(markets.address, rawAddr))

	// Block pending payouts for this market
	await db.update(proposerPayouts).set({ status: 'disputed' })
		.where(and(eq(proposerPayouts.marketAddress, rawAddr), eq(proposerPayouts.status, 'pending')))

	console.log(`[Admin] Market ${rawAddr.slice(0, 10)} DISPUTED: ${body.reason}`)
	return c.json({ success: true, marketAddress: rawAddr })
})

// DELETE /api/admin/controls/dispute/:address
app.delete('/dispute/:address', async (c) => {
	const rawAddr = c.req.param('address').toLowerCase()
	if (!isAddress(rawAddr)) return c.json({ error: 'Invalid address' }, 400)

	await db.update(markets).set({
		disputeFlag: false,
		disputeReason: null,
		disputedAt: null,
		disputedBy: null,
	}).where(eq(markets.address, rawAddr))

	// Unblock payouts
	await db.update(proposerPayouts).set({ status: 'pending' })
		.where(and(eq(proposerPayouts.marketAddress, rawAddr), eq(proposerPayouts.status, 'disputed')))

	console.log(`[Admin] Market ${rawAddr.slice(0, 10)} dispute RESOLVED`)
	return c.json({ success: true, marketAddress: rawAddr })
})

// ===================== Wash Trading Flags =====================

// GET /api/admin/controls/flags
app.get('/flags', async (c) => {
	const rows = await db.select().from(washFlags)
		.where(eq(washFlags.dismissed, false))
		.limit(100)
	return c.json({ flags: rows })
})

// POST /api/admin/controls/flags/:id/dismiss
app.post('/flags/:id/dismiss', async (c) => {
	const id = Number(c.req.param('id'))
	if (!Number.isInteger(id)) return c.json({ error: 'Invalid flag ID' }, 400)

	const now = Math.floor(Date.now() / 1000)
	await db.update(washFlags).set({
		dismissed: true,
		reviewedAt: now,
		reviewedBy: 'admin',
	}).where(eq(washFlags.id, id))

	return c.json({ success: true, flagId: id, action: 'dismissed' })
})

// POST /api/admin/controls/flags/:id/confirm — block payout
app.post('/flags/:id/confirm', async (c) => {
	const id = Number(c.req.param('id'))
	if (!Number.isInteger(id)) return c.json({ error: 'Invalid flag ID' }, 400)

	const [flag] = await db.select().from(washFlags).where(eq(washFlags.id, id)).limit(1)
	if (!flag) return c.json({ error: 'Flag not found' }, 404)

	const now = Math.floor(Date.now() / 1000)
	await db.update(washFlags).set({
		reviewedAt: now,
		reviewedBy: 'admin',
	}).where(eq(washFlags.id, id))

	// Block all pending payouts for this market
	await db.update(proposerPayouts).set({ status: 'blocked' })
		.where(and(eq(proposerPayouts.marketAddress, flag.marketAddress), eq(proposerPayouts.status, 'pending')))

	console.log(`[Admin] Wash flag #${id} CONFIRMED for market ${flag.marketAddress.slice(0, 10)} — payouts blocked`)
	return c.json({ success: true, flagId: id, action: 'confirmed', marketAddress: flag.marketAddress })
})

export default app
