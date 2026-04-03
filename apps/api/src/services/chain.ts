import { createPublicClient, createWalletClient, http, webSocket } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { env } from '../env.js'

export const signerAccount = privateKeyToAccount(env.SIGNER_PRIVATE_KEY as `0x${string}`)
export const ownerAccount = privateKeyToAccount(env.OWNER_PRIVATE_KEY as `0x${string}`)

export const publicClient = createPublicClient({
  chain: base,
  transport: http(env.RPC_URL, { batch: false }),
  batch: { multicall: false },
})

// WebSocket client for event subscriptions (null if WS_RPC_URL not configured)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const wsPublicClient: any = env.WS_RPC_URL
  ? createPublicClient({
      chain: base,
      transport: webSocket(env.WS_RPC_URL),
    })
  : null

export const walletClient = createWalletClient({
  chain: base,
  transport: http(env.RPC_URL),
  account: ownerAccount,
})
