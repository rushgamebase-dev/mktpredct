import { EventEmitter } from 'node:events'
import type { WsServerMessage } from '@rush/shared'

class MarketBroadcast extends EventEmitter {
  emit(marketAddress: string, message: WsServerMessage): boolean {
    return super.emit(marketAddress, message)
  }

  on(marketAddress: string, listener: (message: WsServerMessage) => void): this {
    return super.on(marketAddress, listener)
  }

  off(marketAddress: string, listener: (message: WsServerMessage) => void): this {
    return super.off(marketAddress, listener)
  }
}

export const broadcast = new MarketBroadcast()
broadcast.setMaxListeners(0)
