import type { ErrorHandler } from 'hono'

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('[API Error]', err)
  const status = 'status' in err && typeof err.status === 'number' ? err.status : 500
  const message = err.message || 'Internal Server Error'
  return c.json({ error: message }, status as any)
}
