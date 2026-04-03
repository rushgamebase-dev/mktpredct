import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { env } from './env.js'
import { errorHandler } from './middleware/error.js'
import { setupWebSocket } from './ws/handler.js'
import { startIndexer } from './indexer/index.js'
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

const app = new Hono()

app.use('/*', cors())
app.onError(errorHandler)

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

// Start the indexer loop
startIndexer()
