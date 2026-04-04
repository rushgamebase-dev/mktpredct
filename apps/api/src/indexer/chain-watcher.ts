import { eq } from 'drizzle-orm'
import { markets, syncState } from '@rush/shared/db/schema'
import { MarketABI, MarketFactoryABI } from '@rush/shared'
import { db } from '../db.js'
import { wsPublicClient, publicClient } from '../services/chain.js'
import { env } from '../env.js'
import { getBlockTimestamp } from './block-cache.js'
import { processMarketEvent } from './market-indexer.js'

// Known market addresses (loaded from DB, updated on new market creation)
const knownMarkets = new Set<string>()

// Buffer events by block for flush-per-block debounce
const blockBuffer = new Map<bigint, Array<{
  eventName: string
  args: Record<string, any>
  address: string
  txHash: string
  blockNumber: bigint
  logIndex: number
}>>()

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushScheduledAt: number | null = null
const FLUSH_DELAY = 10 // ms — flush after block settles
const MAX_FLUSH_WAIT = 100 // ms — max wait before forced flush

async function flushBlock(blockNumber: bigint): Promise<void> {
  const events = blockBuffer.get(blockNumber)
  if (!events || events.length === 0) return
  blockBuffer.delete(blockNumber)

  const timestamp = await getBlockTimestamp(blockNumber)

  for (const evt of events) {
    const marketAddr = evt.address.toLowerCase()

    // Fetch current market state
    const rows = await db.select().from(markets)
      .where(eq(markets.address, marketAddr)).limit(1)
    if (rows.length === 0) {
      console.warn(`[ChainWatcher] Event for unknown market ${marketAddr}, skipping`)
      continue
    }

    try {
      await processMarketEvent(
        evt.eventName,
        evt.args,
        rows[0],
        timestamp,
        evt.txHash,
        Number(evt.blockNumber),
        evt.logIndex,
      )
    } catch (e) {
      console.error(`[ChainWatcher] Error processing ${evt.eventName} on ${marketAddr}:`, e)
    }
  }

  // Update sync_state for each affected market
  const affectedMarkets = new Set(events.map((e) => e.address.toLowerCase()))
  const now = Math.floor(Date.now() / 1000)
  for (const addr of affectedMarkets) {
    try {
      const existing = await db.select().from(syncState)
        .where(eq(syncState.key, addr)).limit(1)
      if (existing.length > 0) {
        await db.update(syncState)
          .set({ lastBlock: Number(blockNumber), lastTimestamp: now })
          .where(eq(syncState.key, addr))
      } else {
        await db.insert(syncState).values({
          key: addr,
          lastBlock: Number(blockNumber),
          lastTimestamp: now,
        })
      }
    } catch (e) {
      console.error(`[ChainWatcher] sync_state update error for ${addr}:`, e)
    }
  }
}

function bufferEvent(
  eventName: string,
  args: Record<string, any>,
  address: string,
  txHash: string,
  blockNumber: bigint,
  logIndex: number,
): void {
  if (!blockBuffer.has(blockNumber)) {
    blockBuffer.set(blockNumber, [])
  }
  blockBuffer.get(blockNumber)!.push({ eventName, args, address, txHash, blockNumber, logIndex })

  // Debounce with max wait: flush after FLUSH_DELAY of quiet, but never wait longer than MAX_FLUSH_WAIT
  const now = Date.now()
  if (!flushScheduledAt) flushScheduledAt = now

  if (flushTimer) clearTimeout(flushTimer)

  const elapsed = now - flushScheduledAt
  const delay = Math.min(FLUSH_DELAY, Math.max(0, MAX_FLUSH_WAIT - elapsed))

  flushTimer = setTimeout(async () => {
    flushScheduledAt = null
    const blocks = [...blockBuffer.keys()].sort((a, b) => (a < b ? -1 : 1))
    for (const bn of blocks) {
      await flushBlock(bn)
    }
  }, delay)
}

// ---------------------------------------------------------------------------
// Market event subscriptions (7 total: 6 market events + 1 factory)
// ---------------------------------------------------------------------------

const MARKET_EVENTS = [
  'BetPlaced',
  'MarketResolved',
  'MarketCancelled',
  'MarketExpired',
  'Claimed',
  'FeeWithdrawn',
] as const

type UnwatchFn = () => void
const unwatchers: UnwatchFn[] = []

function startMarketEventWatchers(): void {
  if (!wsPublicClient) return

  for (const eventName of MARKET_EVENTS) {
    const unwatch = wsPublicClient.watchContractEvent({
      abi: MarketABI,
      eventName,
      onLogs: (logs: any[]) => {
        console.log(`[ChainWatcher] onLogs fired: ${eventName} | ${logs.length} logs received`)
        for (const log of logs) {
          const addr = (log.address as string).toLowerCase()
          const known = knownMarkets.has(addr)
          if (!known) {
            console.log(`[ChainWatcher] Filtered out: ${addr.slice(0, 10)}... (not in knownMarkets)`)
            continue
          }

          console.log(`[ChainWatcher] Event: ${log.eventName} | market=${addr.slice(0, 10)}... | block=${log.blockNumber} | tx=${log.transactionHash?.slice(0, 10)}...`)

          bufferEvent(
            log.eventName,
            log.args as Record<string, any>,
            addr,
            log.transactionHash!,
            log.blockNumber!,
            log.logIndex!,
          )
        }
      },
      onError: (error: Error) => {
        console.error(`[ChainWatcher] WS error on ${eventName}:`, error.message)
      },
    })
    unwatchers.push(unwatch)
  }

  console.log(`[ChainWatcher] Subscribed to ${MARKET_EVENTS.length} market event types`)
}

function startFactoryWatcher(): void {
  if (!wsPublicClient) return

  const factoryAddress = env.FACTORY_ADDRESS as `0x${string}`

  const unwatch = wsPublicClient.watchContractEvent({
    address: factoryAddress,
    abi: MarketFactoryABI,
    eventName: 'MarketCreated',
    onLogs: async (logs: any[]) => {
      for (const log of logs) {
        const args = log.args as {
          market: `0x${string}`
          outcomeCount: bigint
          labels: string[]
          deadline: bigint
          gracePeriod: bigint
        }
        const newAddr = args.market.toLowerCase()
        console.log(`[ChainWatcher] New market detected: ${newAddr}`)

        // Add to known markets immediately so events are captured
        knownMarkets.add(newAddr)

        // Insert market to DB (factory-indexer logic)
        try {
          const [feeBps, feeRecipient, signer] = await Promise.all([
            publicClient.readContract({ address: args.market, abi: MarketABI, functionName: 'feeBps' }),
            publicClient.readContract({ address: args.market, abi: MarketABI, functionName: 'feeRecipient' }),
            publicClient.readContract({ address: args.market, abi: MarketABI, functionName: 'signer' }),
          ])

          const timestamp = await getBlockTimestamp(log.blockNumber!)
          const totalPerOutcome = Array.from({ length: Number(args.outcomeCount) }, () => '0')

          await db.insert(markets).values({
            address: newAddr,
            question: '',
            outcomeCount: Number(args.outcomeCount),
            labels: args.labels,
            deadline: Number(args.deadline),
            gracePeriod: Number(args.gracePeriod),
            status: 'open',
            totalPool: '0',
            totalPerOutcome,
            feeBps: Number(feeBps),
            feeRecipient: (feeRecipient as string).toLowerCase(),
            signerAddress: (signer as string).toLowerCase(),
            createdAt: timestamp,
            createdBlock: Number(log.blockNumber!),
            createdTxHash: log.transactionHash!,
          }).onConflictDoNothing()

          const question = await publicClient.readContract({
            address: args.market,
            abi: MarketABI,
            functionName: 'question',
          })
          await db.update(markets)
            .set({ question: question as string })
            .where(eq(markets.address, newAddr))

          console.log(`[ChainWatcher] Market ${newAddr} indexed from WS`)
        } catch (e) {
          console.error(`[ChainWatcher] Error indexing new market ${newAddr}:`, e)
        }
      }
    },
    onError: (error: Error) => {
      console.error('[ChainWatcher] WS error on MarketCreated:', error.message)
    },
  })
  unwatchers.push(unwatch)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function startChainWatcher(): Promise<void> {
  if (!wsPublicClient) {
    console.log('[ChainWatcher] No WS_RPC_URL configured, skipping')
    return
  }

  // Load known markets from DB
  const allMarkets = await db.select({ address: markets.address }).from(markets)
  for (const m of allMarkets) {
    knownMarkets.add(m.address.toLowerCase())
  }
  console.log(`[ChainWatcher] Loaded ${knownMarkets.size} known markets`)

  // Start subscriptions
  startFactoryWatcher()
  startMarketEventWatchers()

  console.log('[ChainWatcher] WebSocket event subscriptions active')
}

export function stopChainWatcher(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  for (const unwatch of unwatchers) {
    unwatch()
  }
  unwatchers.length = 0
  console.log('[ChainWatcher] Stopped')
}
