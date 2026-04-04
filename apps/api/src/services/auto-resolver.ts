import { eq } from 'drizzle-orm'
import { markets, counterState } from '@rush/shared/db/schema'
import { MarketABI } from '@rush/shared'
import { db } from '../db.js'
import { publicClient, walletClient, ownerAccount } from './chain.js'
import { signResolve } from './oracle.js'

const CHECK_INTERVAL = 30_000 // 30s normal
const NEAR_DEADLINE_INTERVAL = 5_000 // 5s when close to deadline
const NEAR_DEADLINE_WINDOW = 120 // 2 min before deadline = high frequency
const MAX_RESOLVE_ATTEMPTS = 3

let running = false
const failedAttempts = new Map<string, number>()

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

      // 4. TX safety: getCode check
      const code = await publicClient.getCode({ address: addr })
      if (!code || code === '0x') {
        console.error(`[AutoResolver] ${addr.slice(0, 10)}... no contract code, skipping`)
        continue
      }

      // 5. Sign resolve
      let signature: `0x${string}`
      try {
        signature = await signResolve(addr, winningOutcome)
        console.log(`[AutoResolver] ${addr.slice(0, 10)}... signature generated`)
      } catch (e: any) {
        console.error(`[AutoResolver] Sign failed for ${addr.slice(0, 10)}...: ${e.message?.slice(0, 80)}`)
        continue
      }

      // 6. TX safety: simulate before send
      try {
        await publicClient.simulateContract({
          address: addr,
          abi: MarketABI,
          functionName: 'resolve',
          args: [BigInt(winningOutcome), signature],
          account: ownerAccount.address,
        })
      } catch (e: any) {
        console.error(`[AutoResolver] ${addr.slice(0, 10)}... simulation failed: ${e.message?.slice(0, 100)}`)
        const attempts = (failedAttempts.get(market.address) ?? 0) + 1
        failedAttempts.set(market.address, attempts)
        if (attempts >= MAX_RESOLVE_ATTEMPTS) {
          console.error(`[AutoResolver] ${addr.slice(0, 10)}... max attempts reached, marking expired`)
          await db.update(markets).set({ status: 'expired' }).where(eq(markets.address, market.address))
          failedAttempts.delete(market.address)
        }
        continue
      }

      // 7. Send resolve tx
      try {
        const txHash = await walletClient.writeContract({
          address: addr,
          abi: MarketABI,
          functionName: 'resolve',
          args: [BigInt(winningOutcome), signature],
        })
        console.log(`[AutoResolver] ${addr.slice(0, 10)}... tx sent: ${txHash}`)

        // 8. Wait for receipt
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

        if (receipt.status === 'success') {
          console.log(`[AutoResolver] ${addr.slice(0, 10)}... RESOLVED ✓ | outcome=${winningOutcome} (${winningOutcome === 0 ? 'Yes' : 'No'}) | block=${receipt.blockNumber} | tx=${txHash}`)

          // 9. Update DB
          await db.update(markets).set({
            status: 'resolved',
            winningOutcome,
            resolvedAt: Math.floor(Date.now() / 1000),
          }).where(eq(markets.address, market.address))

          failedAttempts.delete(market.address)
          console.log(`[AutoResolver] ${addr.slice(0, 10)}... DB updated`)
        } else {
          const attempts = (failedAttempts.get(market.address) ?? 0) + 1
          failedAttempts.set(market.address, attempts)
          console.error(`[AutoResolver] ${addr.slice(0, 10)}... tx reverted (attempt ${attempts}/${MAX_RESOLVE_ATTEMPTS}): ${txHash}`)
          if (attempts >= MAX_RESOLVE_ATTEMPTS) {
            console.error(`[AutoResolver] ${addr.slice(0, 10)}... max attempts reached, marking expired`)
            await db.update(markets).set({ status: 'expired' }).where(eq(markets.address, market.address))
            failedAttempts.delete(market.address)
          }
        }
      } catch (e: any) {
        const attempts = (failedAttempts.get(market.address) ?? 0) + 1
        failedAttempts.set(market.address, attempts)
        console.error(`[AutoResolver] Resolve tx failed for ${addr.slice(0, 10)}... (attempt ${attempts}/${MAX_RESOLVE_ATTEMPTS}): ${e.message?.slice(0, 100)}`)
        if (attempts >= MAX_RESOLVE_ATTEMPTS) {
          console.error(`[AutoResolver] ${addr.slice(0, 10)}... max attempts reached, marking expired`)
          await db.update(markets).set({ status: 'expired' }).where(eq(markets.address, market.address))
          failedAttempts.delete(market.address)
        }
      }
    }
  } catch (e: any) {
    console.error('[AutoResolver] Error:', e.message?.slice(0, 100))
  } finally {
    running = false
  }
}

export function startAutoResolver(): void {
  console.log('[AutoResolver] Starting (adaptive interval: 30s normal, 5s near deadline)')

  async function loop(): Promise<void> {
    await checkAndResolve()

    // Determine next interval based on deadline proximity
    let nextInterval = CHECK_INTERVAL
    try {
      const now = Math.floor(Date.now() / 1000)
      const openCounters = await db.select().from(markets)
        .where(eq(markets.status, 'open'))

      const needsFastCheck = openCounters.some((m) =>
        m.marketType === 'counter' && (
          m.deadline <= now || // past deadline
          (m.deadline > now && m.deadline - now <= NEAR_DEADLINE_WINDOW) // near deadline
        )
      )
      if (needsFastCheck) {
        nextInterval = NEAR_DEADLINE_INTERVAL
      }
    } catch {
      // Fall through with default interval
    }

    setTimeout(loop, nextInterval)
  }

  loop()
}
