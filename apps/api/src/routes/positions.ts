import { Hono } from 'hono'
import { eq, and, sql } from 'drizzle-orm'
import { bets, markets } from '@rush/shared/db/schema'
import { MarketABI } from '@rush/shared'
import type { UserPositionsResponse, UserPosition } from '@rush/shared'
import { db } from '../db.js'
import { publicClient } from '../services/chain.js'

const app = new Hono()

// GET /api/markets/:address/positions/:user
app.get('/:address/positions/:user', async (c) => {
  const address = c.req.param('address').toLowerCase()
  const user = c.req.param('user').toLowerCase() as `0x${string}`

  // Get market for labels
  const marketRows = await db
    .select()
    .from(markets)
    .where(eq(markets.address, address))
    .limit(1)

  if (marketRows.length === 0) {
    return c.json({ error: 'Market not found' }, 404)
  }

  const market = marketRows[0]
  const labels = market.labels as string[]

  // Aggregate bets by outcomeIndex
  const betAggregates = await db
    .select({
      outcomeIndex: bets.outcomeIndex,
      totalAmount: sql<string>`CAST(SUM(CAST(${bets.amount} AS NUMERIC)) AS TEXT)`,
    })
    .from(bets)
    .where(and(eq(bets.marketAddress, address), eq(bets.user, user)))
    .groupBy(bets.outcomeIndex)

  const positions: UserPosition[] = []
  let totalBet = 0n

  for (const agg of betAggregates) {
    const amount = agg.totalAmount || '0'
    totalBet += BigInt(amount)
    positions.push({
      outcomeIndex: agg.outcomeIndex,
      amount,
      label: labels[agg.outcomeIndex] || `Outcome ${agg.outcomeIndex}`,
    })
  }

  // Read on-chain claimable and claimed status
  let claimable = '0'
  let claimed = false

  try {
    const [claimableResult, claimedResult] = await Promise.all([
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: MarketABI,
        functionName: 'getClaimable',
        args: [user],
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: MarketABI,
        functionName: 'claimed',
        args: [user],
      }),
    ])
    claimable = (claimableResult as bigint).toString()
    claimed = claimedResult as boolean
  } catch {
    // Contract call may revert if market not resolved yet; defaults are fine
  }

  const response: UserPositionsResponse = {
    positions,
    totalBet: totalBet.toString(),
    claimable,
    claimed,
  }

  return c.json(response)
})

export default app
