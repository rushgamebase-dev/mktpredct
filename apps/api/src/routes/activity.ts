import { Hono } from 'hono'
import { eq, desc, asc } from 'drizzle-orm'
import { bets, claims, markets } from '@rush/shared/db/schema'
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
    // Return 50/50 baseline so charts render something
    const market = await db.select().from(markets).where(eq(markets.address, address)).limit(1)
    const oc = market[0]?.outcomeCount ?? 2
    const evenOdds = Array.from({ length: oc }, () => Math.round(100 / oc))
    const now = Math.floor(Date.now() / 1000)
    return c.json({ points: [
      { timestamp: now - 3600, odds: evenOdds },
      { timestamp: now, odds: evenOdds },
    ] } satisfies ChartResponse)
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

  // If only 1 point, add a second point at "now" so charts can draw a line
  if (points.length === 1) {
    points.push({ timestamp: Math.floor(Date.now() / 1000), odds: points[0].odds })
  }

  return c.json({ points } satisfies ChartResponse)
})

export default app
