import { publicClient, wsPublicClient } from '../services/chain.js'
import { syncFactory } from './factory-indexer.js'
import { syncMarkets } from './market-indexer.js'

const CONFIRMATION_BLOCKS = 5n
const POLL_INTERVAL = wsPublicClient ? 10_000 : 2000

let running = false
const startedAt = Date.now()
let lastEventBlock = 0n

function uptime(): string {
  const s = Math.floor((Date.now() - startedAt) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
}

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

    const lag = latestBlock - safeBlock
    console.log(`[Indexer] heartbeat | block=${safeBlock} | head=${latestBlock} | lag=${lag} | uptime=${uptime()}`)

    await syncFactory(safeBlock)
    await syncMarkets(safeBlock)
  } catch (err: any) {
    console.error('[Indexer] Error:', err?.message ?? err, err?.stack?.slice(0, 200) ?? '')
  } finally {
    running = false
  }
}

export function startIndexer(): void {
  const mode = wsPublicClient ? `polling fallback (${POLL_INTERVAL / 1000}s)` : `primary polling (${POLL_INTERVAL / 1000}s)`
  console.log(`[Indexer] Starting — ${mode}`)
  tick()
  setInterval(tick, POLL_INTERVAL)
}
