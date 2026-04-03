import { createPublicClient, createWalletClient, http } from 'viem'
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

export const walletClient = createWalletClient({
  chain: base,
  transport: http(env.RPC_URL),
  account: ownerAccount,
})
