import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { WsServerMessage, WsGlobalMessage } from '@rush/shared'
import { broadcast } from './broadcast.js'

export function setupWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true })

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
    // /ws/global subscribes to __global channel, otherwise per-market
    const channel = raw === 'global' ? '__global' : raw.toLowerCase()

    const listener = (message: WsServerMessage | WsGlobalMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message))
      }
    }

    broadcast.on(channel, listener)

    ws.on('close', () => {
      broadcast.off(channel, listener)
    })

    ws.on('error', () => {
      broadcast.off(channel, listener)
    })
  })
}
