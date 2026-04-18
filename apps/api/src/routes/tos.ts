import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { verifyMessage, isAddress } from 'viem'
import { tosAcceptances } from '@rush/shared/db/schema'
import { db } from '../db.js'

const TOS_CURRENT_VERSION = '1.0'

const app = new Hono()

// POST /api/tos/accept
app.post('/accept', async (c) => {
	const body = await c.req.json<{
		userAddress: string
		tosVersion: string
		timestamp: number
		signature: string
	}>()

	if (!body.userAddress || !isAddress(body.userAddress)) {
		return c.json({ error: 'Valid userAddress is required' }, 400)
	}
	if (body.tosVersion !== TOS_CURRENT_VERSION) {
		return c.json({ error: `tosVersion must be "${TOS_CURRENT_VERSION}"` }, 400)
	}
	if (!body.timestamp || typeof body.timestamp !== 'number') {
		return c.json({ error: 'timestamp is required' }, 400)
	}
	const now = Math.floor(Date.now() / 1000)
	if (Math.abs(now - body.timestamp) > 600) {
		return c.json({ error: 'Timestamp out of range (>10 min)' }, 400)
	}
	if (!body.signature) {
		return c.json({ error: 'signature is required' }, 400)
	}

	const message = `I accept the Rush Markets Terms of Service v${body.tosVersion}\naddress: ${body.userAddress.toLowerCase()}\ntimestamp: ${body.timestamp}`
	try {
		const valid = await verifyMessage({
			address: body.userAddress as `0x${string}`,
			message,
			signature: body.signature as `0x${string}`,
		})
		if (!valid) return c.json({ error: 'Invalid signature' }, 401)
	} catch {
		return c.json({ error: 'Invalid signature' }, 401)
	}

	const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
	const ipHash = createHash('sha256').update(ip).digest('hex')

	await db.insert(tosAcceptances).values({
		userAddress: body.userAddress.toLowerCase(),
		tosVersion: body.tosVersion,
		acceptedAt: body.timestamp,
		ipHash,
		signature: body.signature,
	}).onConflictDoNothing()

	return c.json({ success: true, tosVersion: body.tosVersion })
})

export default app
