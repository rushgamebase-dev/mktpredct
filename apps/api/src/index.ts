import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { env } from './env.js'
import { errorHandler } from './middleware/error.js'
import { rateLimit } from './middleware/rate-limit.js'
import { setupWebSocket } from './ws/handler.js'
import { startIndexer } from './indexer/index.js'
import { startChainWatcher } from './indexer/chain-watcher.js'
import { startTwitterPollers } from './services/data-sources/twitter.js'
import { startAutoResolver } from './services/auto-resolver.js'
import marketsRoutes from './routes/markets.js'
import activityRoutes from './routes/activity.js'
import positionsRoutes from './routes/positions.js'
import adminRoutes from './routes/admin.js'
import commentsRoutes from './routes/comments.js'
import usersRoutes from './routes/users.js'
import leaderboardRoutes from './routes/leaderboard.js'
import statsRoutes from './routes/stats.js'
import counterRoutes from './routes/counter.js'
import notificationsRoutes from './routes/notifications.js'
import newsRoutes from './routes/news.js'
import proposalsRoutes from './routes/proposals.js'
import adminProposalsRoutes from './routes/admin-proposals.js'

const app = new Hono()

app.use('/*', cors({
	origin: process.env.FRONTEND_URL || 'https://markets.rushgame.vip',
	allowMethods: ['GET', 'POST', 'OPTIONS'],
	allowHeaders: ['Content-Type', 'x-api-key'],
	maxAge: 86400,
}))
app.onError(errorHandler)

// Rate limit: 60 requests/min burst, 2/sec sustained
app.use('/api/*', rateLimit(60, 2))

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

// Mount routes
app.route('/api/markets', marketsRoutes)
app.route('/api/markets', activityRoutes)
app.route('/api/markets', positionsRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/markets', commentsRoutes)
app.route('/api/markets', statsRoutes)
app.route('/api/markets', counterRoutes)
app.route('/api/users', usersRoutes)
app.route('/api/leaderboard', leaderboardRoutes)
app.route('/api/users', notificationsRoutes)
app.route('/api/news', newsRoutes)
app.route('/api/proposals', proposalsRoutes)
app.route('/api/admin/proposals', adminProposalsRoutes)

// Start HTTP server
const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`[API] Server listening on http://localhost:${info.port}`)
  },
)

// Attach WebSocket upgrade handler to the underlying Node HTTP server
setupWebSocket(server as any)

// Start the indexer loop + chain watcher + data source pollers + auto-resolver
startIndexer()
startChainWatcher()
startTwitterPollers()
startAutoResolver()
