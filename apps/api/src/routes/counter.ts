import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { counterState } from '@rush/shared/db/schema'
import type { CounterResponse } from '@rush/shared'
import { db } from '../db.js'
import { getCachedTweets } from '../services/data-sources/twitter.js'

const app = new Hono()

// GET /api/markets/:address/counter
app.get('/:address/counter', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()

    const rows = await db
      .select()
      .from(counterState)
      .where(eq(counterState.marketAddress, address))
      .limit(1)

    if (rows.length === 0) {
      const response: CounterResponse = {
        currentCount: 0,
        ratePerHour: 0,
        projected: 0,
        lastEventAt: 0,
        timeline: [],
      }
      return c.json(response)
    }

    const row = rows[0]
    // Get cached tweets from twitter poller
    const tweets = getCachedTweets(address)

    return c.json({
      currentCount: row.currentCount,
      ratePerHour: Number(row.ratePerHour),
      projected: row.projected,
      lastEventAt: row.lastEventAt,
      timeline: (row.timeline as { hour: number; count: number }[]) ?? [],
      tweets: tweets.map((t) => ({
        id: t.id,
        text: t.text,
        createdAt: t.createdAt,
        likeCount: t.likeCount,
        retweetCount: t.retweetCount,
      })),
    })
  } catch (err) {
    console.error('[counter] GET error:', err)
    return c.json({ error: 'Failed to fetch counter state' }, 500)
  }
})

export default app
