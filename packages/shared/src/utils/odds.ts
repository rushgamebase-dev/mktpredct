/**
 * Parimutuel odds as 0-100 integer percentages, one per outcome.
 *
 * Project invariant: odds are ALWAYS integers in [0, 100] — never 0-1 floats,
 * never 0-10000 bps, never multiplied by 100 a second time somewhere else.
 *
 * Pool is in wei; we keep BigInt math for the division and round to integer
 * at the end so float precision never leaks into the value the UI renders.
 */
export function computeOdds(totalPerOutcome: readonly string[], totalPool: string): number[] {
	const pool = BigInt(totalPool)
	if (pool === 0n) return totalPerOutcome.map(() => 0)
	return totalPerOutcome.map((v) => {
		const pct = (BigInt(v) * 10000n) / pool
		return Math.round(Number(pct) / 100)
	})
}
