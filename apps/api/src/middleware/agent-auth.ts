import { createHash, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import { agents } from '@rush/shared/db/schema'
import { db } from '../db.js'

/**
 * Authenticate agents via Bearer token in Authorization header.
 * The raw key is hashed with SHA-256 and compared against key_hash in DB.
 * Sets c.set('agent', agentRow) for downstream use.
 */
export const agentAuth: MiddlewareHandler = async (c, next) => {
	const auth = c.req.header('Authorization')
	if (!auth?.startsWith('Bearer ')) {
		return c.json({ code: 'MISSING_AUTH', detail: 'Authorization: Bearer <api_key> header required' }, 401)
	}

	const rawKey = auth.slice(7).trim()
	if (!rawKey) {
		return c.json({ code: 'MISSING_AUTH', detail: 'API key is empty' }, 401)
	}

	const hash = createHash('sha256').update(rawKey).digest('hex')

	const [agent] = await db
		.select()
		.from(agents)
		.where(eq(agents.keyHash, hash))
		.limit(1)

	if (!agent) {
		return c.json({ code: 'INVALID_KEY', detail: 'API key not recognized' }, 401)
	}
	if (!agent.isActive) {
		return c.json({ code: 'KEY_DISABLED', detail: 'This API key has been deactivated' }, 403)
	}

	// Update last_used_at (fire and forget — don't block the request)
	db.update(agents)
		.set({ lastUsedAt: Math.floor(Date.now() / 1000) })
		.where(eq(agents.id, agent.id))
		.catch(() => {})

	c.set('agent', agent)
	await next()
}

/**
 * Generate a random API key with prefix for easy identification.
 * Returns { raw, hash } — raw is shown once to the user, hash is stored.
 */
export function generateAgentKey(): { raw: string; hash: string } {
	const bytes = new Uint8Array(32)
	crypto.getRandomValues(bytes)
	const raw = `rush_${Buffer.from(bytes).toString('hex')}`
	const hash = createHash('sha256').update(raw).digest('hex')
	return { raw, hash }
}
