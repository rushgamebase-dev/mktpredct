import { eq, sql, and } from 'drizzle-orm'
import { markets, bets, claims, fees, syncState, marketStats, userStats } from '@rush/shared/db/schema'
import { MarketABI } from '@rush/shared'
import type { WsServerMessage } from '@rush/shared'
import { db } from '../db.js'
import { publicClient } from '../services/chain.js'
import { broadcast } from '../ws/broadcast.js'

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

          // --- Update market_stats ---
          const userAddr = args.user.toLowerCase()
          try {
            // Check if user already bet on this market (for unique bettor count)
            const existingBets = await db.select().from(bets)
              .where(and(eq(bets.marketAddress, market.address), eq(bets.user, userAddr)))
              .limit(2)
            const isNewBettor = existingBets.length <= 1 // 1 = the one we just inserted

            const now24h = Math.floor(Date.now() / 1000) - 86400

            // Upsert market_stats
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

            // Upsert user_stats
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
            // Stats update failure should not break indexing
            console.error('[Indexer] Stats update error:', e)
          }

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

          // --- Update user_stats with win/pnl ---
          try {
            const claimUser = args.user.toLowerCase()
            const payoutWei = args.payout

            // Get total bet by this user on this market
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
