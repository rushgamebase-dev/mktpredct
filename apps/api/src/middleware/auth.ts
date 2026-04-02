import type { MiddlewareHandler } from 'hono'
import { env } from '../env.js'

export const adminAuth: MiddlewareHandler = async (c, next) => {
  const apiKey = c.req.header('x-api-key')
  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
}
