import { publicClient } from '../services/chain.js'
import { syncFactory } from './factory-indexer.js'
import { syncMarkets } from './market-indexer.js'

const CONFIRMATION_BLOCKS = 5n
const POLL_INTERVAL = 2000

let running = false

async function tick(): Promise<void> {
  if (running) return
  running = true

  try {
    const latestBlock = await publicClient.getBlockNumber()
    const safeBlock = latestBlock - CONFIRMATION_BLOCKS

    if (safeBlock < 0n) {
      running = false
      return
    }

    await syncFactory(safeBlock)
    await syncMarkets(safeBlock)
  } catch (err: any) {
    console.error('[Indexer] Error:', err?.message ?? err, err?.stack?.slice(0, 200) ?? '')
  } finally {
    running = false
  }
}

export function startIndexer(): void {
  console.log('[Indexer] Starting indexer loop (every 2s)')
  tick()
  setInterval(tick, POLL_INTERVAL)
}
