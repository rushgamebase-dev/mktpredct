import { Hono } from 'hono'
import { eq, sql, gte, and } from 'drizzle-orm'
import { marketStats, bets } from '@rush/shared/db/schema'
import type { MarketStatsResponse } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

// GET /api/markets/:address/stats
app.get('/:address/stats', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()

    // Try cached stats first
    const cached = await db
      .select()
      .from(marketStats)
      .where(eq(marketStats.marketAddress, address))
      .limit(1)

    if (cached.length > 0) {
      const row = cached[0]
      const response: MarketStatsResponse = {
        totalBettors: row.totalBettors,
        largestBet: row.largestBet,
        volume24h: row.volume24h,
        bets24h: row.bets24h,
        momentum: row.momentum,
        yesPercentBettors: 0,
        noPercentBettors: 0,
      }
      return c.json(response)
    }

    // Compute on the fly from bets table
    const now = Math.floor(Date.now() / 1000)
    const twentyFourHoursAgo = now - 86400

    const [statsResult, stats24hResult] = await Promise.all([
      db
        .select({
          totalBettors: sql<number>`COUNT(DISTINCT ${bets.user})`,
          largestBet: sql<string>`COALESCE(CAST(MAX(CAST(${bets.amount} AS NUMERIC)) AS TEXT), '0')`,
        })
        .from(bets)
        .where(eq(bets.marketAddress, address)),
      db
        .select({
          volume24h: sql<string>`COALESCE(CAST(SUM(CAST(${bets.amount} AS NUMERIC)) AS TEXT), '0')`,
          bets24h: sql<number>`COUNT(*)`,
        })
        .from(bets)
        .where(and(eq(bets.marketAddress, address), gte(bets.timestamp, twentyFourHoursAgo))),
    ])

    const stats = statsResult[0]
    const stats24h = stats24hResult[0]

    const response: MarketStatsResponse = {
      totalBettors: Number(stats?.totalBettors ?? 0),
      largestBet: stats?.largestBet ?? '0',
      volume24h: stats24h?.volume24h ?? '0',
      bets24h: Number(stats24h?.bets24h ?? 0),
      momentum: 'neutral',
      yesPercentBettors: 0,
      noPercentBettors: 0,
    }

    return c.json(response)
  } catch (err) {
    console.error('[stats] GET error:', err)
    return c.json({ error: 'Failed to fetch market stats' }, 500)
  }
})

export default app
