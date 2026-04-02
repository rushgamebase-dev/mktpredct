import type { MarketStatus } from '../config'

export interface MarketSummary {
	address: string
	question: string
	outcomeCount: number
	labels: string[]
	deadline: number
	gracePeriod: number
	status: MarketStatus
	winningOutcome: number | null
	totalPool: string
	totalPerOutcome: string[]
	odds: number[]
	createdAt: number
	resolvedAt: number | null
}

export interface MarketDetail extends MarketSummary {
	feeBps: number
	feeRecipient: string
	signer: string
}

export interface BetEvent {
	id: number
	marketAddress: string
	user: string
	outcomeIndex: number
	amount: string
	txHash: string
	blockNumber: number
	timestamp: number
}

export interface ClaimEvent {
	id: number
	marketAddress: string
	user: string
	payout: string
	txHash: string
	blockNumber: number
	timestamp: number
}

export interface UserPosition {
	outcomeIndex: number
	amount: string
	label: string
}

export interface UserPositions {
	positions: UserPosition[]
	totalBet: string
	claimable: string
	claimed: boolean
}

export interface OddsPoint {
	timestamp: number
	odds: number[]
}
