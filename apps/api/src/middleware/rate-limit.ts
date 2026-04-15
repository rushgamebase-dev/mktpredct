import type { Context, MiddlewareHandler } from 'hono'

interface RateBucket {
	tokens: number
	lastRefill: number
}

const buckets = new Map<string, RateBucket>()

// Cleanup stale buckets every 5 minutes
setInterval(() => {
	const now = Date.now()
	for (const [key, bucket] of buckets) {
		if (now - bucket.lastRefill > 300_000) buckets.delete(key)
	}
}, 300_000)

function getClientIp(c: Context): string {
	const xff = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
	if (xff) return xff
	const cf = c.req.header('cf-connecting-ip')
	if (cf) return cf
	const fly = c.req.header('fly-client-ip')
	if (fly) return fly
	const real = c.req.header('x-real-ip')
	if (real) return real
	return 'unknown'
}

/**
 * Simple token-bucket rate limiter (in-memory, per IP).
 *
 * Requests arriving without a resolvable IP share a tight bucket so a single
 * attacker forging/dropping headers cannot exhaust the public tier for everyone.
 */
export function rateLimit(maxTokens: number, refillPerSecond: number): MiddlewareHandler {
	return async (c, next) => {
		const ip = getClientIp(c)
		const isUnknown = ip === 'unknown'
		if (isUnknown) {
			console.warn('[RateLimit] Request without resolvable IP — applying tight shared bucket')
		}
		const effectiveMax = isUnknown ? Math.min(10, maxTokens) : maxTokens
		const effectiveRefill = isUnknown ? Math.min(0.1, refillPerSecond) : refillPerSecond

		const now = Date.now()
		let bucket = buckets.get(ip)

		if (!bucket) {
			bucket = { tokens: effectiveMax, lastRefill: now }
			buckets.set(ip, bucket)
		}

		const elapsed = (now - bucket.lastRefill) / 1000
		bucket.tokens = Math.min(effectiveMax, bucket.tokens + elapsed * effectiveRefill)
		bucket.lastRefill = now

		if (bucket.tokens < 1) {
			c.header('Retry-After', String(Math.ceil((1 - bucket.tokens) / effectiveRefill)))
			return c.json({ error: 'Too many requests' }, 429)
		}

		bucket.tokens -= 1
		await next()
	}
}

/**
 * Per-identity rate limiter. `keyFn` extracts an identity (wallet address,
 * user id, etc.) from the request body/params. Pair this with `rateLimit` for
 * endpoints that must also be bounded per-user rather than per-connection.
 */
export function rateLimitByKey(
	maxTokens: number,
	refillPerSecond: number,
	keyFn: (c: Context) => string | null | Promise<string | null>,
): MiddlewareHandler {
	return async (c, next) => {
		const key = await keyFn(c)
		if (!key) {
			await next()
			return
		}
		const bucketKey = `identity:${key.toLowerCase()}`
		const now = Date.now()
		let bucket = buckets.get(bucketKey)

		if (!bucket) {
			bucket = { tokens: maxTokens, lastRefill: now }
			buckets.set(bucketKey, bucket)
		}

		const elapsed = (now - bucket.lastRefill) / 1000
		bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillPerSecond)
		bucket.lastRefill = now

		if (bucket.tokens < 1) {
			c.header('Retry-After', String(Math.ceil((1 - bucket.tokens) / refillPerSecond)))
			return c.json({ error: 'Too many requests' }, 429)
		}

		bucket.tokens -= 1
		await next()
	}
}
