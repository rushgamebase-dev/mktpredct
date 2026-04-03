import { eq } from 'drizzle-orm'
import { markets, syncState } from '@rush/shared/db/schema'
import { MarketFactoryABI, MarketABI } from '@rush/shared'
import { db } from '../db.js'
import { publicClient } from '../services/chain.js'
import { env } from '../env.js'

const FACTORY_SYNC_KEY = 'factory'
const BATCH_SIZE = 90n // Chainstack: max ~100 blocks per eth_getLogs

export async function syncFactory(currentBlock: bigint): Promise<void> {
  const factoryAddress = env.FACTORY_ADDRESS as `0x${string}`

  const existing = await db
    .select()
    .from(syncState)
    .where(eq(syncState.key, FACTORY_SYNC_KEY))
    .limit(1)

  let fromBlock = existing.length > 0 ? BigInt(existing[0].lastBlock) + 1n : 0n

  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock
      ? currentBlock
      : fromBlock + BATCH_SIZE - 1n

    const logs = await publicClient.getContractEvents({
      address: factoryAddress,
      abi: MarketFactoryABI,
      eventName: 'MarketCreated',
      fromBlock,
      toBlock,
    })

    for (const log of logs) {
      const { market, outcomeCount, labels, deadline, gracePeriod } = log.args as {
        market: `0x${string}`
        outcomeCount: bigint
        labels: string[]
        deadline: bigint
        gracePeriod: bigint
      }

      const [feeBps, feeRecipient, signer] = await Promise.all([
        publicClient.readContract({
          address: market,
          abi: MarketABI,
          functionName: 'feeBps',
        }),
        publicClient.readContract({
          address: market,
          abi: MarketABI,
          functionName: 'feeRecipient',
        }),
        publicClient.readContract({
          address: market,
          abi: MarketABI,
          functionName: 'signer',
        }),
      ])

      const block = await publicClient.getBlock({ blockNumber: log.blockNumber! })

      const totalPerOutcome = Array.from({ length: Number(outcomeCount) }, () => '0')

      await db.insert(markets).values({
        address: market.toLowerCase(),
        question: '', // Question is not in the event; read from contract
        outcomeCount: Number(outcomeCount),
        labels,
        deadline: Number(deadline),
        gracePeriod: Number(gracePeriod),
        status: 'open',
        totalPool: '0',
        totalPerOutcome,
        feeBps: Number(feeBps),
        feeRecipient: (feeRecipient as string).toLowerCase(),
        signerAddress: (signer as string).toLowerCase(),
        createdAt: Number(block.timestamp),
        createdBlock: Number(log.blockNumber!),
        createdTxHash: log.transactionHash!,
      }).onConflictDoNothing()

      // Read question from the contract (not in event args)
      const question = await publicClient.readContract({
        address: market,
        abi: MarketABI,
        functionName: 'question',
      })

      await db
        .update(markets)
        .set({ question: question as string })
        .where(eq(markets.address, market.toLowerCase()))
    }

    fromBlock = toBlock + 1n
  }

  const now = Math.floor(Date.now() / 1000)
  if (existing.length > 0) {
    await db
      .update(syncState)
      .set({ lastBlock: Number(currentBlock), lastTimestamp: now })
      .where(eq(syncState.key, FACTORY_SYNC_KEY))
  } else {
    await db.insert(syncState).values({
      key: FACTORY_SYNC_KEY,
      lastBlock: Number(currentBlock),
      lastTimestamp: now,
    })
  }
}
