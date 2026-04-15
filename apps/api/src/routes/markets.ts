import { Hono } from 'hono'
import { eq, sql, count } from 'drizzle-orm'
import { markets } from '@rush/shared/db/schema'
import type { MarketSummary, MarketDetail, MarketsListResponse, MarketDetailResponse } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

function computeOdds(totalPerOutcome: string[], totalPool: string): number[] {
  const pool = BigInt(totalPool)
  if (pool === 0n) {
    return totalPerOutcome.map(() => 0)
  }
  return totalPerOutcome.map((v) => {
    const pct = (BigInt(v) * 10000n) / pool
    return Math.round(Number(pct) / 100)
  })
}

function toMarketSummary(row: typeof markets.$inferSelect): MarketSummary {
  return {
    address: row.address,
    question: row.question,
    outcomeCount: row.outcomeCount,
    labels: row.labels as string[],
    deadline: row.deadline,
    gracePeriod: row.gracePeriod,
    status: row.status as MarketSummary['status'],
    winningOutcome: row.winningOutcome,
    totalPool: row.totalPool,
    totalPerOutcome: row.totalPerOutcome as string[],
    odds: computeOdds(row.totalPerOutcome as string[], row.totalPool),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    marketType: (row.marketType ?? 'classic') as MarketSummary['marketType'],
    sourceConfig: (row.sourceConfig as MarketSummary['sourceConfig']) ?? null,
  }
}

// GET /api/markets
app.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') || '20')))
  const status = c.req.query('status') || 'all'

  const offset = (page - 1) * pageSize

  let query = db.select().from(markets)
  let countQuery = db.select({ total: count() }).from(markets)

  if (status !== 'all') {
    query = query.where(eq(markets.status, status)) as any
    countQuery = countQuery.where(eq(markets.status, status)) as any
  }

  const [rows, countResult] = await Promise.all([
    query.limit(pageSize).offset(offset),
    countQuery,
  ])

  const total = countResult[0]?.total ?? 0

  const response: MarketsListResponse = {
    markets: rows.map(toMarketSummary),
    total,
    page,
    pageSize,
  }

  return c.json(response)
})

// GET /api/markets/:address
app.get('/:address', async (c) => {
  const address = c.req.param('address').toLowerCase()

  const rows = await db
    .select()
    .from(markets)
    .where(eq(markets.address, address))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'Market not found' }, 404)
  }

  const row = rows[0]
  const response: MarketDetailResponse = {
    ...toMarketSummary(row),
    feeBps: row.feeBps,
    feeRecipient: row.feeRecipient,
    signer: row.signerAddress,
  }

  return c.json(response)
})

export default app
