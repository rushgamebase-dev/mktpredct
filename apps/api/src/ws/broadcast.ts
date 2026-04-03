import { EventEmitter } from 'node:events'
import type { WsServerMessage, WsGlobalMessage } from '@rush/shared'

type BroadcastMessage = WsServerMessage | WsGlobalMessage

class MarketBroadcast extends EventEmitter {
  emit(channel: string, message: BroadcastMessage): boolean {
    return super.emit(channel, message)
  }

  on(channel: string, listener: (message: BroadcastMessage) => void): this {
    return super.on(channel, listener)
  }

  off(channel: string, listener: (message: BroadcastMessage) => void): this {
    return super.off(channel, listener)
  }
}

export const broadcast = new MarketBroadcast()
broadcast.setMaxListeners(0)
