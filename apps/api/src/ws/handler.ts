import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { WsServerMessage } from '@rush/shared'
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
    const marketAddress = (args[0] as string) || ''
    const address = marketAddress.toLowerCase()

    const listener = (message: WsServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message))
      }
    }

    broadcast.on(address, listener)

    ws.on('close', () => {
      broadcast.off(address, listener)
    })

    ws.on('error', () => {
      broadcast.off(address, listener)
    })
  })
}
