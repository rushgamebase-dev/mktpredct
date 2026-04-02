import { eq, sql } from 'drizzle-orm'
import { markets, bets, claims, fees, syncState } from '@rush/shared/db/schema'
import { MarketABI } from '@rush/shared'
import type { WsServerMessage } from '@rush/shared'
import { db } from '../db.js'
import { publicClient } from '../services/chain.js'
import { broadcast } from '../ws/broadcast.js'

const BATCH_SIZE = 2000n

function computeOdds(totalPerOutcome: string[], totalPool: string): number[] {
  const pool = BigInt(totalPool)
  if (pool === 0n) {
    return totalPerOutcome.map(() => 0)
  }
  return totalPerOutcome.map((v) => {
    const pct = (BigInt(v) * 10000n) / pool
    return Number(pct) / 100
  })
}

export async function syncMarkets(currentBlock: bigint): Promise<void> {
  const allMarkets = await db.select().from(markets)

  for (const market of allMarkets) {
    if (market.status !== 'open' && market.status !== 'resolved') {
      // Only skip fully terminal states that don't need more indexing
      // resolved markets may still have claims/fees to index
    }

    await syncSingleMarket(market, currentBlock)
  }
}

async function syncSingleMarket(
  market: typeof markets.$inferSelect,
  currentBlock: bigint,
): Promise<void> {
  const marketAddress = market.address as `0x${string}`
  const syncKey = market.address

  const existing = await db
    .select()
    .from(syncState)
    .where(eq(syncState.key, syncKey))
    .limit(1)

  let fromBlock = existing.length > 0
    ? BigInt(existing[0].lastBlock) + 1n
    : BigInt(market.createdBlock)

  if (fromBlock > currentBlock) return

  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock
      ? currentBlock
      : fromBlock + BATCH_SIZE - 1n

    const allLogs = await publicClient.getContractEvents({
      address: marketAddress,
      abi: MarketABI,
      fromBlock,
      toBlock,
    })

    let currentTotalPool = BigInt(market.totalPool)
    const currentTotalPerOutcome = market.totalPerOutcome.map((v) => BigInt(v))

    for (const log of allLogs) {
      const eventName = log.eventName
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber! })
      const timestamp = Number(block.timestamp)

      switch (eventName) {
        case 'BetPlaced': {
          const args = log.args as { user: string; outcomeIndex: bigint; amount: bigint }
          const outcomeIdx = Number(args.outcomeIndex)
          const amount = args.amount.toString()

          await db
            .insert(bets)
            .values({
              marketAddress: market.address,
              user: args.user.toLowerCase(),
              outcomeIndex: outcomeIdx,
              amount,
              txHash: log.transactionHash!,
              blockNumber: Number(log.blockNumber!),
              logIndex: log.logIndex!,
              timestamp,
            })
            .onConflictDoNothing()

          currentTotalPool += args.amount
          currentTotalPerOutcome[outcomeIdx] += args.amount

          const totalPerOutcomeStrings = currentTotalPerOutcome.map((v) => v.toString())
          const poolStr = currentTotalPool.toString()

          await db
            .update(markets)
            .set({
              totalPool: poolStr,
              totalPerOutcome: totalPerOutcomeStrings,
            })
            .where(eq(markets.address, market.address))

          const odds = computeOdds(totalPerOutcomeStrings, poolStr)

          const betMsg: WsServerMessage = {
            type: 'bet',
            data: {
              user: args.user.toLowerCase(),
              outcomeIndex: outcomeIdx,
              amount,
              txHash: log.transactionHash!,
              timestamp,
            },
          }
          broadcast.emit(market.address, betMsg)

          const oddsMsg: WsServerMessage = {
            type: 'odds_update',
            data: {
              totalPool: poolStr,
              totalPerOutcome: totalPerOutcomeStrings,
              odds,
            },
          }
          broadcast.emit(market.address, oddsMsg)
          break
        }

        case 'MarketResolved': {
          const args = log.args as { winningOutcome: bigint }
          await db
            .update(markets)
            .set({
              status: 'resolved',
              winningOutcome: Number(args.winningOutcome),
              resolvedAt: timestamp,
            })
            .where(eq(markets.address, market.address))

          const statusMsg: WsServerMessage = {
            type: 'status_change',
            data: {
              status: 'resolved',
              winningOutcome: Number(args.winningOutcome),
            },
          }
          broadcast.emit(market.address, statusMsg)
          break
        }

        case 'MarketCancelled': {
          await db
            .update(markets)
            .set({ status: 'cancelled' })
            .where(eq(markets.address, market.address))

          const cancelMsg: WsServerMessage = {
            type: 'status_change',
            data: { status: 'cancelled', winningOutcome: null },
          }
          broadcast.emit(market.address, cancelMsg)
          break
        }

        case 'MarketExpired': {
          await db
            .update(markets)
            .set({ status: 'expired' })
            .where(eq(markets.address, market.address))

          const expireMsg: WsServerMessage = {
            type: 'status_change',
            data: { status: 'expired', winningOutcome: null },
          }
          broadcast.emit(market.address, expireMsg)
          break
        }

        case 'Claimed': {
          const args = log.args as { user: string; payout: bigint }
          await db
            .insert(claims)
            .values({
              marketAddress: market.address,
              user: args.user.toLowerCase(),
              payout: args.payout.toString(),
              txHash: log.transactionHash!,
              blockNumber: Number(log.blockNumber!),
              logIndex: log.logIndex!,
              timestamp,
            })
            .onConflictDoNothing()

          const claimMsg: WsServerMessage = {
            type: 'claim',
            data: {
              user: args.user.toLowerCase(),
              payout: args.payout.toString(),
            },
          }
          broadcast.emit(market.address, claimMsg)
          break
        }

        case 'FeeWithdrawn': {
          const args = log.args as { amount: bigint }
          await db
            .insert(fees)
            .values({
              marketAddress: market.address,
              amount: args.amount.toString(),
              txHash: log.transactionHash!,
              blockNumber: Number(log.blockNumber!),
              logIndex: log.logIndex!,
              timestamp,
            })
            .onConflictDoNothing()
          break
        }
      }
    }

    fromBlock = toBlock + 1n
  }

  const now = Math.floor(Date.now() / 1000)
  if (existing.length > 0) {
    await db
      .update(syncState)
      .set({ lastBlock: Number(currentBlock), lastTimestamp: now })
      .where(eq(syncState.key, syncKey))
  } else {
    await db.insert(syncState).values({
      key: syncKey,
      lastBlock: Number(currentBlock),
      lastTimestamp: now,
    })
  }
}
