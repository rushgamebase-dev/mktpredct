import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { env } from '../env.js'

export const adminAuth: MiddlewareHandler = async (c, next) => {
	const apiKey = c.req.header('x-api-key')
	if (!apiKey || apiKey.length !== env.ADMIN_API_KEY.length) {
		return c.json({ error: 'Unauthorized' }, 401)
	}
	const match = timingSafeEqual(Buffer.from(apiKey), Buffer.from(env.ADMIN_API_KEY))
	if (!match) {
		return c.json({ error: 'Unauthorized' }, 401)
	}
	await next()
}
