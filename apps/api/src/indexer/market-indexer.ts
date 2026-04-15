import { eq, sql, and } from 'drizzle-orm'
import { markets, bets, claims, fees, syncState, marketStats, userStats } from '@rush/shared/db/schema'
import { MarketABI, computeOdds } from '@rush/shared'
import type { WsServerMessage, WsGlobalMessage } from '@rush/shared'
import { db } from '../db.js'
import { publicClient } from '../services/chain.js'
import { broadcast } from '../ws/broadcast.js'
import { getBlockTimestamp } from './block-cache.js'

const BATCH_SIZE = 2000n // Chainstack Growth: archive enabled, unlimited range

// ---------------------------------------------------------------------------
// processMarketEvent — shared by polling indexer + chain watcher
// ---------------------------------------------------------------------------

function emitGlobal(msg: WsServerMessage, marketAddress: string): void {
  const globalMsg: WsGlobalMessage = { ...msg, marketAddress }
  broadcast.emit('__global', globalMsg)
  console.log(`[Broadcast] ${msg.type} → WS emitted | market=${marketAddress.slice(0, 10)}...`)
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
  console.log(`[Event] ${eventName} | market=${market.address.slice(0, 10)}... | tx=${txHash.slice(0, 10)}... | block=${blockNumber}`)

  switch (eventName) {
    case 'BetPlaced': {
      const outcomeIdx = Number(args.outcomeIndex)
      const amount = args.amount.toString()
      const userAddr = args.user.toLowerCase()

      // DB writes FIRST — so REST queries after WS event find the data
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

      // Fully atomic update — the array is rebuilt in SQL from the current
      // column value, so two concurrent BetPlaced events on the same market
      // cannot clobber each other's totalPerOutcome slot.
      await db
        .update(markets)
        .set({
          totalPool: sql`CAST(CAST(${markets.totalPool} AS NUMERIC) + ${amount} AS TEXT)`,
          totalPerOutcome: sql`(
            SELECT array_agg(
              CASE WHEN ord - 1 = ${outcomeIdx}
                THEN CAST(CAST(elem AS NUMERIC) + CAST(${amount} AS NUMERIC) AS TEXT)
                ELSE elem
              END
              ORDER BY ord
            )
            FROM unnest(${markets.totalPerOutcome}) WITH ORDINALITY AS t(elem, ord)
          )`,
        })
        .where(eq(markets.address, market.address))

      // Re-read canonical state for accurate odds broadcast
      const [updatedMarket] = await db.select().from(markets)
        .where(eq(markets.address, market.address)).limit(1)
      const poolStr = updatedMarket?.totalPool ?? market.totalPool
      const totalPerOutcomeStrings = updatedMarket?.totalPerOutcome ?? market.totalPerOutcome
      const odds = computeOdds(totalPerOutcomeStrings, poolStr)

      // BROADCAST after DB writes — prevents stale REST reads
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
      // DB writes FIRST — so REST queries after WS event find the data
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
      emitGlobal(statusMsg, market.address)

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
      emitGlobal(cancelMsg, market.address)

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
      emitGlobal(expireMsg, market.address)

      break
    }

    case 'Claimed': {
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

      const claimMsg: WsServerMessage = {
        type: 'claim',
        data: {
          user: args.user.toLowerCase(),
          payout: args.payout.toString(),
        },
      }
      broadcast.emit(market.address, claimMsg)
      emitGlobal(claimMsg, market.address)

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
  // Only sync open markets — resolved/cancelled/expired don't receive new events
  const openMarkets = await db.select().from(markets).where(eq(markets.status, 'open'))

  for (const market of openMarkets) {
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

  const lag = currentBlock - fromBlock
  if (lag > 100n) {
    console.log(`[Indexer] WARNING: ${market.address.slice(0, 10)}... is ${lag} blocks behind`)
  }

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

    // Sort logs by (blockNumber, transactionIndex, logIndex) to guarantee order
    const sortedLogs = [...allLogs].sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return Number(a.blockNumber! - b.blockNumber!)
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex! - b.transactionIndex!
      return a.logIndex! - b.logIndex!
    })

    for (const log of sortedLogs) {
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
