import type { ErrorHandler } from 'hono'

export const errorHandler: ErrorHandler = (err, c) => {
	console.error('[API Error]', err)
	const status = 'status' in err && typeof err.status === 'number' ? err.status : 500
	// 5xx: never leak internal messages (Drizzle/viem details expose schema/RPC internals).
	// 4xx: echo the message so clients can correct bad input.
	if (status >= 500) {
		return c.json({ error: 'Internal Server Error' }, 500)
	}
	const message = err.message || 'Request failed'
	return c.json({ error: message }, status as never)
}
