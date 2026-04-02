import { keccak256, encodePacked } from 'viem'
import { signerAccount } from './chain.js'
import { env } from '../env.js'

export async function signResolve(
  marketAddress: `0x${string}`,
  winningOutcome: number,
): Promise<`0x${string}`> {
  const messageHash = keccak256(
    encodePacked(
      ['string', 'uint256', 'address', 'uint256'],
      ['resolve', BigInt(env.CHAIN_ID), marketAddress, BigInt(winningOutcome)],
    ),
  )
  const signature = await signerAccount.signMessage({ message: { raw: messageHash } })
  return signature
}

export async function signCancel(
  marketAddress: `0x${string}`,
): Promise<`0x${string}`> {
  const messageHash = keccak256(
    encodePacked(
      ['string', 'uint256', 'address'],
      ['cancel', BigInt(env.CHAIN_ID), marketAddress],
    ),
  )
  const signature = await signerAccount.signMessage({ message: { raw: messageHash } })
  return signature
}
