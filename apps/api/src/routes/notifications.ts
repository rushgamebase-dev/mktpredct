import { Hono } from 'hono'
import { eq, desc, and } from 'drizzle-orm'
import { verifyMessage } from 'viem'
import { notifications } from '@rush/shared/db/schema'
import type { NotificationsResponse, Notification } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

// GET /api/users/:address/notifications
app.get('/:address/notifications', async (c) => {
	try {
		const address = c.req.param('address').toLowerCase()

		const rows = await db
			.select()
			.from(notifications)
			.where(eq(notifications.userAddress, address))
			.orderBy(desc(notifications.createdAt))
			.limit(30)

		const response: NotificationsResponse = {
			notifications: rows.map((row): Notification => ({
				id: row.id,
				type: row.type,
				title: row.title,
				body: row.body,
				marketAddress: row.marketAddress,
				read: row.read,
				createdAt: row.createdAt,
			})),
		}

		return c.json(response)
	} catch (err) {
		console.error('[notifications] GET error:', err)
		return c.json({ error: 'Failed to fetch notifications' }, 500)
	}
})

// POST /api/users/:address/notifications/read
// Requires an EIP-191 signature from the wallet that owns the notifications —
// otherwise anyone could mark another user's notifications as read.
app.post('/:address/notifications/read', async (c) => {
	try {
		const address = c.req.param('address').toLowerCase()
		const body = await c.req.json<{ signature?: string; timestamp?: number }>().catch(() => ({} as { signature?: string; timestamp?: number }))

		if (!body.signature) {
			return c.json({ error: 'signature is required' }, 401)
		}
		if (!body.timestamp || typeof body.timestamp !== 'number') {
			return c.json({ error: 'timestamp is required' }, 400)
		}
		// Reject signatures older than 5 minutes to prevent indefinite replay
		const now = Math.floor(Date.now() / 1000)
		if (Math.abs(now - body.timestamp) > 300) {
			return c.json({ error: 'signature timestamp out of range' }, 401)
		}

		const message = `Rush Markets: mark notifications read\naddress: ${address}\ntimestamp: ${body.timestamp}`
		try {
			const valid = await verifyMessage({
				address: address as `0x${string}`,
				message,
				signature: body.signature as `0x${string}`,
			})
			if (!valid) {
				return c.json({ error: 'Invalid signature' }, 401)
			}
		} catch {
			return c.json({ error: 'Invalid signature' }, 401)
		}

		await db
			.update(notifications)
			.set({ read: true })
			.where(and(eq(notifications.userAddress, address), eq(notifications.read, false)))

		return c.json({ success: true })
	} catch (err) {
		console.error('[notifications] POST read error:', err)
		return c.json({ error: 'Failed to mark notifications as read' }, 500)
	}
})

export default app
