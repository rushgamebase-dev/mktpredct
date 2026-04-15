import { eq, gte, sql } from 'drizzle-orm'
import { bets, claims, fees, syncState } from '@rush/shared/db/schema'
import { db } from '../db.js'
import { publicClient } from '../services/chain.js'

// Key used to track the indexer's view of the chain tip (distinct from
// per-factory / per-market cursors, which are tracked with their own keys).
const REORG_HEAD_KEY = '__reorg_head'
// When a reorg is detected, rewind this many blocks before the divergence
// point to create a safety margin — the reorg depth may be larger than the
// single block we sampled.
const REORG_BUFFER = 20

/**
 * Compare the hash of the previously recorded safe block against what the
 * chain says now. If they differ a reorg has occurred: delete events at or
 * after the rewind point and reset affected sync cursors so the indexer
 * re-processes them on the next tick.
 *
 * Fail-soft: any RPC/DB error logs and returns without throwing — the regular
 * sync path will still run.
 */
export async function checkForReorg(): Promise<void> {
	let stored: typeof syncState.$inferSelect | undefined
	try {
		const rows = await db
			.select()
			.from(syncState)
			.where(eq(syncState.key, REORG_HEAD_KEY))
			.limit(1)
		stored = rows[0]
	} catch (e) {
		console.warn(`[Reorg] Read head failed: ${errMsg(e)}`)
		return
	}

	if (!stored?.lastBlockHash) return
	const storedBlock = BigInt(stored.lastBlock)

	let currentHash: string | null
	try {
		const block = await publicClient.getBlock({ blockNumber: storedBlock })
		currentHash = block.hash
	} catch (e) {
		console.warn(`[Reorg] Fetch block ${storedBlock} failed: ${errMsg(e)}`)
		return
	}

	if (currentHash === stored.lastBlockHash) return

	const rollbackFrom = Math.max(0, Number(storedBlock) - REORG_BUFFER)
	console.error(
		`[Reorg] DETECTED at block ${storedBlock}: expected ${stored.lastBlockHash}, got ${currentHash}. ` +
			`Rewinding to block ${rollbackFrom}.`,
	)

	try {
		await db.delete(bets).where(gte(bets.blockNumber, rollbackFrom))
		await db.delete(claims).where(gte(claims.blockNumber, rollbackFrom))
		await db.delete(fees).where(gte(fees.blockNumber, rollbackFrom))
		// Rewind only cursors that are at/after the rollback point — cursors
		// safely behind it don't need to be touched.
		await db
			.update(syncState)
			.set({
				lastBlock: rollbackFrom,
				lastBlockHash: null,
				lastTimestamp: Math.floor(Date.now() / 1000),
			})
			.where(gte(syncState.lastBlock, rollbackFrom))
		console.error(`[Reorg] Rollback complete — next tick will re-index from ${rollbackFrom}`)
	} catch (e) {
		console.error(`[Reorg] Rollback failed: ${errMsg(e)}`)
	}
}

/**
 * Record the hash of the current safe block so the next tick can verify the
 * chain hasn't reorg'd past it.
 */
export async function recordSafeBlockHash(safeBlock: bigint): Promise<void> {
	try {
		const block = await publicClient.getBlock({ blockNumber: safeBlock })
		if (!block.hash) return
		const now = Math.floor(Date.now() / 1000)
		await db
			.insert(syncState)
			.values({
				key: REORG_HEAD_KEY,
				lastBlock: Number(safeBlock),
				lastBlockHash: block.hash,
				lastTimestamp: now,
			})
			.onConflictDoUpdate({
				target: syncState.key,
				set: {
					lastBlock: Number(safeBlock),
					lastBlockHash: block.hash,
					lastTimestamp: now,
					updatedAt: sql`now()`,
				},
			})
	} catch (e) {
		console.warn(`[Reorg] Record hash failed: ${errMsg(e)}`)
	}
}

function errMsg(e: unknown): string {
	if (e instanceof Error) return e.message.slice(0, 120)
	return String(e).slice(0, 120)
}
