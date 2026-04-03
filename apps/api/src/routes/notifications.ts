import { Hono } from 'hono'
import { eq, desc, and } from 'drizzle-orm'
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
app.post('/:address/notifications/read', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()

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
