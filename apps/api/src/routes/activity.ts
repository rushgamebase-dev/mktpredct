import { Hono } from 'hono'
import { eq, desc, asc } from 'drizzle-orm'
import { bets, claims } from '@rush/shared/db/schema'
import type { ActivityResponse, ChartResponse } from '@rush/shared'
import type { BetEvent, ClaimEvent, OddsPoint } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

// GET /api/markets/:address/activity
app.get('/:address/activity', async (c) => {
  const address = c.req.param('address').toLowerCase()
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || '50')))

  const [betRows, claimRows] = await Promise.all([
    db
      .select()
      .from(bets)
      .where(eq(bets.marketAddress, address))
      .orderBy(desc(bets.timestamp))
      .limit(limit),
    db
      .select()
      .from(claims)
      .where(eq(claims.marketAddress, address))
      .orderBy(desc(claims.timestamp))
      .limit(limit),
  ])

  const response: ActivityResponse = {
    bets: betRows.map((row): BetEvent => ({
      id: row.id,
      marketAddress: row.marketAddress,
      user: row.user,
      outcomeIndex: row.outcomeIndex,
      amount: row.amount,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      timestamp: row.timestamp,
    })),
    claims: claimRows.map((row): ClaimEvent => ({
      id: row.id,
      marketAddress: row.marketAddress,
      user: row.user,
      payout: row.payout,
      txHash: row.txHash,
      blockNumber: row.blockNumber,
      timestamp: row.timestamp,
    })),
  }

  return c.json(response)
})

// GET /api/markets/:address/chart
app.get('/:address/chart', async (c) => {
  const address = c.req.param('address').toLowerCase()

  const betRows = await db
    .select()
    .from(bets)
    .where(eq(bets.marketAddress, address))
    .orderBy(asc(bets.timestamp), asc(bets.blockNumber), asc(bets.logIndex))

  if (betRows.length === 0) {
    return c.json({ points: [] } satisfies ChartResponse)
  }

  // Determine outcome count from the max outcomeIndex seen
  const maxOutcome = betRows.reduce((max, b) => Math.max(max, b.outcomeIndex), 0)
  const outcomeCount = maxOutcome + 1

  const runningTotals = Array.from({ length: outcomeCount }, () => 0n)
  let runningPool = 0n

  const points: OddsPoint[] = []

  for (const bet of betRows) {
    const amount = BigInt(bet.amount)
    runningTotals[bet.outcomeIndex] += amount
    runningPool += amount

    const odds = runningTotals.map((v) => {
      if (runningPool === 0n) return 0
      return Number((v * 10000n) / runningPool) / 100
    })

    points.push({
      timestamp: bet.timestamp,
      odds,
    })
  }

  return c.json({ points } satisfies ChartResponse)
})

export default app
