import { publicClient } from '../services/chain.js'

const cache = new Map<bigint, number>()

export async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  const cached = cache.get(blockNumber)
  if (cached) return cached

  const block = await publicClient.getBlock({ blockNumber })
  const ts = Number(block.timestamp)
  cache.set(blockNumber, ts)
  return ts
}

export function pruneCache(currentBlock: bigint): void {
  const cutoff = currentBlock - 1000n
  for (const key of cache.keys()) {
    if (key < cutoff) cache.delete(key)
  }
}

// Cleanup every 60s
setInterval(() => {
  if (cache.size === 0) return
  const maxBlock = [...cache.keys()].reduce((a, b) => (a > b ? a : b))
  pruneCache(maxBlock)
}, 60_000)
