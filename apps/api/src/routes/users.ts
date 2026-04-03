import { Hono } from 'hono'
import { eq, and, desc, sql } from 'drizzle-orm'
import { userStats, bets, claims, markets } from '@rush/shared/db/schema'
import type { UserProfile, UserPositionsListResponse } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

// GET /api/users/:address
app.get('/:address', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()

    const rows = await db
      .select()
      .from(userStats)
      .where(eq(userStats.address, address))
      .limit(1)

    if (rows.length === 0) {
      const profile: UserProfile = {
        address,
        totalBets: 0,
        totalVolume: '0',
        totalPnl: '0',
        wins: 0,
        losses: 0,
        winRate: 0,
        lastActive: 0,
      }
      return c.json(profile)
    }

    const row = rows[0]
    const totalGames = row.wins + row.losses
    const profile: UserProfile = {
      address: row.address,
      totalBets: row.totalBets,
      totalVolume: row.totalVolume,
      totalPnl: row.totalPnl,
      wins: row.wins,
      losses: row.losses,
      winRate: totalGames > 0 ? Math.round((row.wins / totalGames) * 10000) / 100 : 0,
      lastActive: row.lastActive,
    }

    return c.json(profile)
  } catch (err) {
    console.error('[users] GET profile error:', err)
    return c.json({ error: 'Failed to fetch user profile' }, 500)
  }
})

// GET /api/users/:address/positions
app.get('/:address/positions', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()

    const rows = await db
      .select({
        marketAddress: bets.marketAddress,
        question: markets.question,
        outcomeIndex: bets.outcomeIndex,
        amount: sql<string>`CAST(SUM(CAST(${bets.amount} AS NUMERIC)) AS TEXT)`,
        labels: markets.labels,
      })
      .from(bets)
      .innerJoin(markets, eq(bets.marketAddress, markets.address))
      .where(and(eq(bets.user, address), eq(markets.status, 'open')))
      .groupBy(bets.marketAddress, markets.question, bets.outcomeIndex, markets.labels)

    const positions = rows.map((row) => {
      const labels = row.labels as string[]
      return {
        marketAddress: row.marketAddress,
        question: row.question,
        outcomeIndex: row.outcomeIndex,
        amount: row.amount || '0',
        label: labels[row.outcomeIndex] || `Outcome ${row.outcomeIndex}`,
      }
    })

    const response: UserPositionsListResponse = { positions }
    return c.json(response)
  } catch (err) {
    console.error('[users] GET positions error:', err)
    return c.json({ error: 'Failed to fetch user positions' }, 500)
  }
})

// GET /api/users/:address/history
app.get('/:address/history', async (c) => {
  try {
    const address = c.req.param('address').toLowerCase()

    const [betRows, claimRows] = await Promise.all([
      db
        .select()
        .from(bets)
        .where(eq(bets.user, address))
        .orderBy(desc(bets.timestamp))
        .limit(50),
      db
        .select()
        .from(claims)
        .where(eq(claims.user, address))
        .orderBy(desc(claims.timestamp))
        .limit(50),
    ])

    return c.json({
      bets: betRows.map((row) => ({
        id: row.id,
        marketAddress: row.marketAddress,
        user: row.user,
        outcomeIndex: row.outcomeIndex,
        amount: row.amount,
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        timestamp: row.timestamp,
      })),
      claims: claimRows.map((row) => ({
        id: row.id,
        marketAddress: row.marketAddress,
        user: row.user,
        payout: row.payout,
        txHash: row.txHash,
        blockNumber: row.blockNumber,
        timestamp: row.timestamp,
      })),
    })
  } catch (err) {
    console.error('[users] GET history error:', err)
    return c.json({ error: 'Failed to fetch user history' }, 500)
  }
})

export default app
