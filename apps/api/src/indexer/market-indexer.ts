import { eq, sql, and } from 'drizzle-orm'
import { markets, bets, claims, fees, syncState, marketStats, userStats } from '@rush/shared/db/schema'
import { MarketABI } from '@rush/shared'
import type { WsServerMessage, WsGlobalMessage } from '@rush/shared'
import { db } from '../db.js'
import { publicClient } from '../services/chain.js'
import { broadcast } from '../ws/broadcast.js'
import { getBlockTimestamp } from './block-cache.js'

const BATCH_SIZE = 2000n // Chainstack Growth: archive enabled, unlimited range

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

// ---------------------------------------------------------------------------
// processMarketEvent — shared by polling indexer + chain watcher
// ---------------------------------------------------------------------------

function emitGlobal(msg: WsServerMessage, marketAddress: string): void {
  const globalMsg: WsGlobalMessage = { ...msg, marketAddress }
  broadcast.emit('__global', globalMsg)
}

export async function processMarketEvent(
  eventName: string,
  args: Record<string, any>,
  market: typeof markets.$inferSelect,
  timestamp: number,
  txHash: string,
  blockNumber: number,
  logIndex: number,
): Promise<void> {
  switch (eventName) {
    case 'BetPlaced': {
      const outcomeIdx = Number(args.outcomeIndex)
      const amount = args.amount.toString()
      const userAddr = args.user.toLowerCase()

      // Compute new pool state
      const currentTotalPool = BigInt(market.totalPool) + BigInt(amount)
      const currentTotalPerOutcome = market.totalPerOutcome.map((v) => BigInt(v))
      currentTotalPerOutcome[outcomeIdx] += BigInt(amount)

      const totalPerOutcomeStrings = currentTotalPerOutcome.map((v) => v.toString())
      const poolStr = currentTotalPool.toString()
      const odds = computeOdds(totalPerOutcomeStrings, poolStr)

      // BROADCAST FIRST (low latency) — then DB async
      const betMsg: WsServerMessage = {
        type: 'bet',
        data: {
          user: userAddr,
          outcomeIndex: outcomeIdx,
          amount,
          txHash,
          timestamp,
        },
      }
      broadcast.emit(market.address, betMsg)
      emitGlobal(betMsg, market.address)

      const oddsMsg: WsServerMessage = {
        type: 'odds_update',
        data: {
          totalPool: poolStr,
          totalPerOutcome: totalPerOutcomeStrings,
          odds,
        },
      }
      broadcast.emit(market.address, oddsMsg)
      emitGlobal(oddsMsg, market.address)

      // DB writes (async, non-blocking for latency)
      await db
        .insert(bets)
        .values({
          marketAddress: market.address,
          user: userAddr,
          outcomeIndex: outcomeIdx,
          amount,
          txHash,
          blockNumber,
          logIndex,
          timestamp,
        })
        .onConflictDoNothing()

      await db
        .update(markets)
        .set({
          totalPool: poolStr,
          totalPerOutcome: totalPerOutcomeStrings,
        })
        .where(eq(markets.address, market.address))

      // Stats updates
      try {
        const existingBets = await db.select().from(bets)
          .where(and(eq(bets.marketAddress, market.address), eq(bets.user, userAddr)))
          .limit(2)
        const isNewBettor = existingBets.length <= 1

        await db.insert(marketStats).values({
          marketAddress: market.address,
          totalBettors: 1,
          largestBet: amount,
          volume24h: amount,
          bets24h: 1,
          momentum: 'neutral',
        }).onConflictDoUpdate({
          target: marketStats.marketAddress,
          set: {
            totalBettors: isNewBettor
              ? sql`${marketStats.totalBettors} + 1`
              : marketStats.totalBettors,
            largestBet: sql`CASE WHEN CAST(${amount} AS NUMERIC) > CAST(${marketStats.largestBet} AS NUMERIC) THEN ${amount} ELSE ${marketStats.largestBet} END`,
            bets24h: sql`${marketStats.bets24h} + 1`,
            volume24h: sql`CAST(CAST(${marketStats.volume24h} AS NUMERIC) + CAST(${amount} AS NUMERIC) AS TEXT)`,
            momentum: sql`CASE WHEN ${marketStats.bets24h} + 1 > 5 THEN 'rising' WHEN ${marketStats.bets24h} + 1 > 2 THEN 'active' ELSE 'neutral' END`,
          },
        })

        await db.insert(userStats).values({
          address: userAddr,
          totalBets: 1,
          totalVolume: amount,
          totalPnl: '0',
          wins: 0,
          losses: 0,
          lastActive: timestamp,
        }).onConflictDoUpdate({
          target: userStats.address,
          set: {
            totalBets: sql`${userStats.totalBets} + 1`,
            totalVolume: sql`CAST(CAST(${userStats.totalVolume} AS NUMERIC) + CAST(${amount} AS NUMERIC) AS TEXT)`,
            lastActive: sql`${timestamp}`,
          },
        })
      } catch (e) {
        console.error('[Indexer] Stats update error:', e)
      }

      break
    }

    case 'MarketResolved': {
      const statusMsg: WsServerMessage = {
        type: 'status_change',
        data: {
          status: 'resolved',
          winningOutcome: Number(args.winningOutcome),
        },
      }
      broadcast.emit(market.address, statusMsg)
      emitGlobal(statusMsg, market.address)

      await db
        .update(markets)
        .set({
          status: 'resolved',
          winningOutcome: Number(args.winningOutcome),
          resolvedAt: timestamp,
        })
        .where(eq(markets.address, market.address))

      break
    }

    case 'MarketCancelled': {
      const cancelMsg: WsServerMessage = {
        type: 'status_change',
        data: { status: 'cancelled', winningOutcome: null },
      }
      broadcast.emit(market.address, cancelMsg)
      emitGlobal(cancelMsg, market.address)

      await db
        .update(markets)
        .set({ status: 'cancelled' })
        .where(eq(markets.address, market.address))

      break
    }

    case 'MarketExpired': {
      const expireMsg: WsServerMessage = {
        type: 'status_change',
        data: { status: 'expired', winningOutcome: null },
      }
      broadcast.emit(market.address, expireMsg)
      emitGlobal(expireMsg, market.address)

      await db
        .update(markets)
        .set({ status: 'expired' })
        .where(eq(markets.address, market.address))

      break
    }

    case 'Claimed': {
      const claimMsg: WsServerMessage = {
        type: 'claim',
        data: {
          user: args.user.toLowerCase(),
          payout: args.payout.toString(),
        },
      }
      broadcast.emit(market.address, claimMsg)
      emitGlobal(claimMsg, market.address)

      await db
        .insert(claims)
        .values({
          marketAddress: market.address,
          user: args.user.toLowerCase(),
          payout: args.payout.toString(),
          txHash,
          blockNumber,
          logIndex,
          timestamp,
        })
        .onConflictDoNothing()

      // User stats: win/pnl
      try {
        const claimUser = args.user.toLowerCase()
        const payoutWei = args.payout

        const userBetsOnMarket = await db.select().from(bets)
          .where(and(eq(bets.marketAddress, market.address), eq(bets.user, claimUser)))
        const totalBetWei = userBetsOnMarket.reduce((sum, b) => sum + BigInt(b.amount), 0n)
        const pnl = payoutWei - totalBetWei
        const isWin = pnl > 0n

        await db.insert(userStats).values({
          address: claimUser,
          totalBets: 0,
          totalVolume: '0',
          totalPnl: pnl.toString(),
          wins: isWin ? 1 : 0,
          losses: isWin ? 0 : 1,
          lastActive: timestamp,
        }).onConflictDoUpdate({
          target: userStats.address,
          set: {
            totalPnl: sql`CAST(CAST(${userStats.totalPnl} AS NUMERIC) + CAST(${pnl.toString()} AS NUMERIC) AS TEXT)`,
            wins: isWin ? sql`${userStats.wins} + 1` : userStats.wins,
            losses: isWin ? userStats.losses : sql`${userStats.losses} + 1`,
            lastActive: sql`${timestamp}`,
          },
        })
      } catch (e) {
        console.error('[Indexer] User stats claim update error:', e)
      }

      break
    }

    case 'FeeWithdrawn': {
      await db
        .insert(fees)
        .values({
          marketAddress: market.address,
          amount: args.amount.toString(),
          txHash,
          blockNumber,
          logIndex,
          timestamp,
        })
        .onConflictDoNothing()
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Polling-based sync (fallback when WS available, primary when not)
// ---------------------------------------------------------------------------

export async function syncMarkets(currentBlock: bigint): Promise<void> {
  const allMarkets = await db.select().from(markets)

  for (const market of allMarkets) {
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

    for (const log of allLogs) {
      const timestamp = await getBlockTimestamp(log.blockNumber!)

      // Re-read market state for each event (pool may have changed)
      const freshMarket = await db.select().from(markets)
        .where(eq(markets.address, market.address)).limit(1)
      const currentMarket = freshMarket[0] ?? market

      await processMarketEvent(
        log.eventName,
        log.args as Record<string, any>,
        currentMarket,
        timestamp,
        log.transactionHash!,
        Number(log.blockNumber!),
        log.logIndex!,
      )
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
