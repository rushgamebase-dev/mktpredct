import { Hono } from 'hono'
import { desc, sql } from 'drizzle-orm'
import { userStats } from '@rush/shared/db/schema'
import type { LeaderboardResponse, LeaderboardEntry } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

// GET /api/leaderboard
app.get('/', async (c) => {
  try {
    const period = c.req.query('period') || 'all'

    // Period filtering is Phase G — for now return all-time stats.
    // totalPnl is stored as TEXT to preserve wei precision, so we must CAST
    // to NUMERIC for ordering — otherwise "9" > "100" lexicographically.
    const rows = await db
      .select()
      .from(userStats)
      .orderBy(desc(sql`CAST(${userStats.totalPnl} AS NUMERIC)`))
      .limit(20)

    const entries: LeaderboardEntry[] = rows.map((row) => {
      const totalGames = row.wins + row.losses
      return {
        address: row.address,
        pnl: row.totalPnl,
        volume: row.totalVolume,
        winRate: totalGames > 0 ? Math.round((row.wins / totalGames) * 10000) / 100 : 0,
        bets: row.totalBets,
      }
    })

    const response: LeaderboardResponse = { entries, period }
    return c.json(response)
  } catch (err) {
    console.error('[leaderboard] GET error:', err)
    return c.json({ error: 'Failed to fetch leaderboard' }, 500)
  }
})

export default app
