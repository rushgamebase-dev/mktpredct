import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseEther,
  formatEther,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import postgres from 'postgres'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Load .env.production manually (no dotenv dependency needed at root)
const envPath = resolve(import.meta.dirname, '../../../.env.production')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  if (!process.env[key]) process.env[key] = val
}

const DATABASE_URL = process.env.DATABASE_URL
const RPC_URL = process.env.RPC_URL
const PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY

if (!DATABASE_URL || !RPC_URL || !PRIVATE_KEY) {
  console.error('[Seed] Missing DATABASE_URL, RPC_URL, or OWNER_PRIVATE_KEY in .env.production')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')
const BET_AMOUNT = parseEther('0.001')

const MarketABI = [
  {
    type: 'function',
    name: 'bet',
    inputs: [{ name: 'outcomeIndex', type: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'status',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deadline',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'BetPlaced',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'outcomeIndex', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`)

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
})

const walletClient = createWalletClient({
  chain: base,
  transport: http(RPC_URL),
  account,
})

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

const sql = postgres(DATABASE_URL)

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[Seed] Mode: ${DRY_RUN ? 'DRY RUN (simulate only)' : 'LIVE (will send txs)'}`)
  console.log(`[Seed] Wallet: ${account.address}`)

  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`[Seed] Balance: ${formatEther(balance)} ETH`)

  if (balance < BET_AMOUNT && !DRY_RUN) {
    console.error('[Seed] Insufficient balance for even 1 bet. Aborting.')
    process.exit(1)
  }

  // Fetch all open markets from DB (SOURCE OF TRUTH)
  const allMarkets = await sql`
    SELECT address, question, total_pool, total_per_outcome, outcome_count, status
    FROM markets WHERE status = 'open'
  `
  console.log(`[Seed] Found ${allMarkets.length} open markets in DB`)

  const needsSeed = allMarkets.filter((m: any) => {
    if (m.total_pool === '0') return false
    const odds = (m.total_per_outcome as string[]).map((v: string) => BigInt(v))
    const pool = odds.reduce((a: bigint, b: bigint) => a + b, 0n)
    if (pool === 0n) return false
    return odds.some((v: bigint) => v === 0n)
  })

  console.log(`[Seed] ${needsSeed.length} markets need seed bet (have 0% outcome)`)
  console.log('---')

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const market of needsSeed) {
    const rawAddress = (market as any).address as string
    const question = ((market as any).question as string).slice(0, 50)

    // 1. CHECKSUM VALIDATION
    let checksummed: `0x${string}`
    try {
      checksummed = getAddress(rawAddress) as `0x${string}`
    } catch {
      console.log(`[Seed] ${rawAddress} | INVALID CHECKSUM → SKIPPED`)
      skipped++
      continue
    }

    // Identify which outcome has 0%
    const odds = ((market as any).total_per_outcome as string[]).map((v: string) => BigInt(v))
    const zeroIdx = odds.findIndex((v) => v === 0n)
    if (zeroIdx === -1) {
      console.log(`[Seed] ${checksummed} | ${question} | No 0% outcome → SKIPPED`)
      skipped++
      continue
    }

    console.log(`[Seed] ${checksummed} | ${question}`)
    console.log(`       odds: [${odds.map((o) => o.toString()).join(', ')}] → bet outcome ${zeroIdx}`)

    // 2. CONTRACT EXISTS
    const code = await publicClient.getCode({ address: checksummed })
    if (!code || code === '0x') {
      console.log(`  ✗ Contract code: 0x (NO CONTRACT) → SKIPPED`)
      skipped++
      console.log('---')
      continue
    }
    console.log(`  ✓ Contract exists (${Math.floor(code.length / 2)} bytes)`)

    // 3. MARKET STATUS === Open (0)
    let status: number
    try {
      status = Number(await publicClient.readContract({
        address: checksummed,
        abi: MarketABI,
        functionName: 'status',
      }))
    } catch (e: any) {
      console.log(`  ✗ Status read failed: ${e.message?.slice(0, 80)} → SKIPPED`)
      skipped++
      console.log('---')
      continue
    }
    if (status !== 0) {
      console.log(`  ✗ Status: ${status} (not Open) → SKIPPED`)
      skipped++
      console.log('---')
      continue
    }
    console.log(`  ✓ Status: Open`)

    // 4. DEADLINE NOT PASSED
    let deadline: bigint
    try {
      deadline = await publicClient.readContract({
        address: checksummed,
        abi: MarketABI,
        functionName: 'deadline',
      }) as bigint
    } catch (e: any) {
      console.log(`  ✗ Deadline read failed: ${e.message?.slice(0, 80)} → SKIPPED`)
      skipped++
      console.log('---')
      continue
    }
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (deadline <= now) {
      console.log(`  ✗ Deadline passed: ${new Date(Number(deadline) * 1000).toISOString()} → SKIPPED`)
      skipped++
      console.log('---')
      continue
    }
    console.log(`  ✓ Deadline: ${new Date(Number(deadline) * 1000).toISOString().slice(0, 10)} (valid)`)

    // 5. SIMULATE TRANSACTION
    try {
      await publicClient.simulateContract({
        address: checksummed,
        abi: MarketABI,
        functionName: 'bet',
        args: [BigInt(zeroIdx)],
        value: BET_AMOUNT,
        account: account.address,
      })
    } catch (e: any) {
      console.log(`  ✗ Simulation failed: ${e.message?.slice(0, 100)} → SKIPPED`)
      skipped++
      console.log('---')
      continue
    }
    console.log(`  ✓ Simulation: success`)

    // 6. SEND (or skip in dry-run)
    if (DRY_RUN) {
      console.log(`  ○ DRY RUN — would send 0.001 ETH bet on outcome ${zeroIdx}`)
      sent++
      console.log('---')
      continue
    }

    // Check balance before each tx
    const currentBalance = await publicClient.getBalance({ address: account.address })
    if (currentBalance < BET_AMOUNT + parseEther('0.0001')) {
      console.log(`  ✗ Insufficient balance (${formatEther(currentBalance)} ETH) → STOPPING`)
      failed++
      break
    }

    try {
      const hash = await walletClient.writeContract({
        address: checksummed,
        abi: MarketABI,
        functionName: 'bet',
        args: [BigInt(zeroIdx)],
        value: BET_AMOUNT,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status === 'success' && receipt.logs.length > 0) {
        console.log(`  ✓ TX sent: ${hash} (block ${receipt.blockNumber})`)
        sent++
      } else if (receipt.status === 'success' && receipt.logs.length === 0) {
        console.log(`  ✗ TX ${hash} succeeded but NO LOGS (bet likely rejected) → FAILED`)
        failed++
      } else {
        console.log(`  ✗ TX ${hash} reverted → FAILED`)
        failed++
      }
    } catch (e: any) {
      console.log(`  ✗ TX failed: ${e.message?.slice(0, 100)}`)
      failed++
    }

    console.log('---')
  }

  console.log(`\n[Seed] Done: ${sent} sent, ${skipped} skipped, ${failed} failed`)

  await sql.end()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[Seed] Fatal error:', e)
  process.exit(1)
})
