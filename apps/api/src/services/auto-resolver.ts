import { eq } from 'drizzle-orm'
import { markets, counterState } from '@rush/shared/db/schema'
import { MarketABI } from '@rush/shared'
import { db } from '../db.js'
import { publicClient, walletClient } from './chain.js'
import { signResolve } from './oracle.js'

const CHECK_INTERVAL = 30_000 // 30s normal
const NEAR_DEADLINE_INTERVAL = 5_000 // 5s when close to deadline
const NEAR_DEADLINE_WINDOW = 120 // 2 min before deadline = high frequency

let running = false

async function checkAndResolve(): Promise<void> {
  if (running) return
  running = true

  try {
    const now = Math.floor(Date.now() / 1000)

    // Find counter markets past deadline that are still open
    const openCounters = await db.select().from(markets)
      .where(eq(markets.status, 'open'))

    const counterMarkets = openCounters.filter((m) => {
      return m.marketType === 'counter' && m.deadline <= now
    })

    if (counterMarkets.length === 0) {
      // Check if any market is NEAR deadline (for logging)
      const nearDeadline = openCounters.filter((m) => {
        return m.marketType === 'counter' && m.deadline > now && m.deadline - now <= NEAR_DEADLINE_WINDOW
      })
      if (nearDeadline.length > 0) {
        console.log(`[AutoResolver] ${nearDeadline.length} counter market(s) near deadline (<2min)`)
      }
      return
    }

    for (const market of counterMarkets) {
      const addr = market.address as `0x${string}`
      const config = market.sourceConfig as Record<string, unknown> | null
      const threshold = (config?.threshold as number) ?? 20

      console.log(`[AutoResolver] Market ${addr.slice(0, 10)}... deadline passed, resolving...`)

      // 1. Verify on-chain status is still Open (0)
      let onChainStatus: number
      try {
        onChainStatus = Number(await publicClient.readContract({
          address: addr,
          abi: MarketABI,
          functionName: 'status',
        }))
      } catch (e: any) {
        console.error(`[AutoResolver] Failed to read status for ${addr.slice(0, 10)}...: ${e.message?.slice(0, 80)}`)
        continue
      }

      if (onChainStatus !== 0) {
        console.log(`[AutoResolver] ${addr.slice(0, 10)}... status=${onChainStatus} (not Open), skipping`)
        // Update DB to reflect actual status
        const statusMap: Record<number, string> = { 1: 'resolved', 2: 'cancelled', 3: 'expired' }
        if (statusMap[onChainStatus]) {
          await db.update(markets).set({ status: statusMap[onChainStatus] }).where(eq(markets.address, market.address))
        }
        continue
      }

      // 2. Get counter value from DB
      const counterRows = await db.select().from(counterState)
        .where(eq(counterState.marketAddress, market.address))
        .limit(1)

      const currentCount = counterRows[0]?.currentCount ?? 0
      console.log(`[AutoResolver] ${addr.slice(0, 10)}... count=${currentCount} threshold=${threshold}`)

      // 3. Determine winning outcome
      // Yes (0) = count >= threshold, No (1) = count < threshold
      const winningOutcome = currentCount >= threshold ? 0 : 1
      console.log(`[AutoResolver] ${addr.slice(0, 10)}... winner: ${winningOutcome === 0 ? 'Yes' : 'No'} (outcome ${winningOutcome})`)

      // 4. Sign resolve
      let signature: `0x${string}`
      try {
        signature = await signResolve(addr, winningOutcome)
        console.log(`[AutoResolver] ${addr.slice(0, 10)}... signature generated`)
      } catch (e: any) {
        console.error(`[AutoResolver] Sign failed for ${addr.slice(0, 10)}...: ${e.message?.slice(0, 80)}`)
        continue
      }

      // 5. Send resolve tx
      try {
        const txHash = await walletClient.writeContract({
          address: addr,
          abi: MarketABI,
          functionName: 'resolve',
          args: [BigInt(winningOutcome), signature],
        })
        console.log(`[AutoResolver] ${addr.slice(0, 10)}... tx sent: ${txHash}`)

        // 6. Wait for receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

        if (receipt.status === 'success') {
          console.log(`[AutoResolver] ${addr.slice(0, 10)}... RESOLVED ✓ | outcome=${winningOutcome} (${winningOutcome === 0 ? 'Yes' : 'No'}) | block=${receipt.blockNumber} | tx=${txHash}`)

          // 7. Update DB
          await db.update(markets).set({
            status: 'resolved',
            winningOutcome,
            resolvedAt: Math.floor(Date.now() / 1000),
          }).where(eq(markets.address, market.address))

          console.log(`[AutoResolver] ${addr.slice(0, 10)}... DB updated`)
        } else {
          console.error(`[AutoResolver] ${addr.slice(0, 10)}... tx reverted: ${txHash}`)
        }
      } catch (e: any) {
        console.error(`[AutoResolver] Resolve tx failed for ${addr.slice(0, 10)}...: ${e.message?.slice(0, 100)}`)
      }
    }
  } catch (e: any) {
    console.error('[AutoResolver] Error:', e.message?.slice(0, 100))
  } finally {
    running = false
  }
}

export function startAutoResolver(): void {
  console.log('[AutoResolver] Starting (30s check, 5s near deadline)')

  // Normal check every 30s
  setInterval(checkAndResolve, CHECK_INTERVAL)

  // Near-deadline high-frequency check every 5s
  setInterval(async () => {
    const now = Math.floor(Date.now() / 1000)
    const openCounters = await db.select().from(markets)
      .where(eq(markets.status, 'open'))

    const nearDeadline = openCounters.some((m) => {
      return m.marketType === 'counter' && m.deadline > now && m.deadline - now <= NEAR_DEADLINE_WINDOW
    })

    // Also check if any already past deadline
    const pastDeadline = openCounters.some((m) => {
      return m.marketType === 'counter' && m.deadline <= now
    })

    if (nearDeadline || pastDeadline) {
      await checkAndResolve()
    }
  }, NEAR_DEADLINE_INTERVAL)

  // Initial check
  checkAndResolve()
}
