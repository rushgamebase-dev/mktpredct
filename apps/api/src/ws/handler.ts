import type { Server as HttpServer } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { desc, eq } from 'drizzle-orm'
import { bets, markets, syncState } from '@rush/shared/db/schema'
import type { WsBetData, WsGlobalMessage, WsServerMessage, WsSnapshotData } from '@rush/shared'
import { computeOdds } from '@rush/shared'
import { db } from '../db.js'
import { broadcast } from './broadcast.js'

const HEARTBEAT_INTERVAL = 30_000 // 30s — ping interval

async function buildSnapshot(marketAddress: string): Promise<WsSnapshotData | null> {
	const [marketRow] = await db
		.select()
		.from(markets)
		.where(eq(markets.address, marketAddress))
		.limit(1)
	if (!marketRow) return null

	const recent = await db
		.select()
		.from(bets)
		.where(eq(bets.marketAddress, marketAddress))
		.orderBy(desc(bets.blockNumber), desc(bets.logIndex))
		.limit(20)

	const [reorgHead] = await db
		.select()
		.from(syncState)
		.where(eq(syncState.key, '__reorg_head'))
		.limit(1)

	const perOutcome = marketRow.totalPerOutcome as string[]
	const recentBets: WsBetData[] = recent.map((b) => ({
		user: b.user,
		outcomeIndex: b.outcomeIndex,
		amount: b.amount,
		txHash: b.txHash,
		timestamp: b.timestamp,
	}))

	return {
		marketAddress: marketRow.address,
		lastEventBlock: reorgHead?.lastBlock ?? 0,
		totalPool: marketRow.totalPool,
		totalPerOutcome: perOutcome,
		odds: computeOdds(perOutcome, marketRow.totalPool),
		status: marketRow.status,
		winningOutcome: marketRow.winningOutcome,
		recentBets,
	}
}

export function setupWebSocket(server: HttpServer): void {
	const wss = new WebSocketServer({ noServer: true })

	// Heartbeat: detect and clean up dead connections
	const heartbeat = setInterval(() => {
		for (const ws of wss.clients) {
			const ext = ws as WebSocket & { isAlive?: boolean }
			if (ext.isAlive === false) {
				ws.terminate()
				continue
			}
			ext.isAlive = false
			ws.ping()
		}
	}, HEARTBEAT_INTERVAL)

	wss.on('close', () => clearInterval(heartbeat))

	server.on('upgrade', (req, socket, head) => {
		const url = new URL(req.url || '/', `http://${req.headers.host}`)
		const match = url.pathname.match(/^\/ws\/(.+)$/)

		if (!match) {
			socket.destroy()
			return
		}

		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit('connection', ws, req, match[1])
		})
	})

	wss.on('connection', (ws: WebSocket, _req: IncomingMessage, ...args: unknown[]) => {
		const raw = (args[0] as string) || ''
		// /ws/global subscribes to the global channel, otherwise per-market
		const isGlobal = raw === 'global'
		const channel = isGlobal ? '__global' : raw.toLowerCase()

		const ext = ws as WebSocket & { isAlive?: boolean }
		ext.isAlive = true
		ws.on('pong', () => {
			ext.isAlive = true
		})

		const listener = (message: WsServerMessage | WsGlobalMessage) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(message))
			}
		}

		broadcast.on(channel, listener)
		console.log(`[WS] Client connected → ${channel} (listeners: ${broadcast.listenerCount(channel)})`)

		// Per-market snapshot on connect — gives the client full state without a
		// separate REST roundtrip and enables gap detection on reconnect.
		if (!isGlobal && channel.startsWith('0x') && channel.length === 42) {
			buildSnapshot(channel)
				.then((snapshot) => {
					if (ws.readyState !== WebSocket.OPEN) return
					if (snapshot) {
						ws.send(JSON.stringify({ type: 'snapshot', data: snapshot } satisfies WsServerMessage))
					} else {
						// Market not found — tell the client explicitly so it can show an
						// error state instead of waiting forever for a snapshot.
						ws.send(
							JSON.stringify({
								type: 'error',
								data: { message: 'Market not found' },
							} satisfies WsServerMessage),
						)
					}
				})
				.catch((e) => {
					console.warn(`[WS] Snapshot failed for ${channel.slice(0, 10)}...: ${e?.message?.slice(0, 100)}`)
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(
							JSON.stringify({
								type: 'error',
								data: { message: 'Snapshot failed' },
							} satisfies WsServerMessage),
						)
					}
				})
		}

		const cleanup = () => {
			broadcast.off(channel, listener)
			console.log(`[WS] Client disconnected ← ${channel} (listeners: ${broadcast.listenerCount(channel)})`)
		}

		ws.on('close', cleanup)
		ws.on('error', cleanup)
	})
}
