// Event payload types — exported so consumers can type props/state without
// pattern-matching on the full WsServerMessage union.
export type WsBetData = {
	user: string
	outcomeIndex: number
	amount: string
	txHash: string
	timestamp: number
}

export type WsOddsUpdateData = {
	totalPool: string
	totalPerOutcome: string[]
	odds: number[]
}

export type WsStatusChangeData = {
	status: string
	winningOutcome: number | null
}

export type WsClaimData = {
	user: string
	payout: string
}

export type WsCounterUpdateData = {
	currentCount: number
	ratePerHour: number
	projected: number
	lastEventAt: number
	delta: number
}

// Snapshot sent immediately on connect so clients have full state without a
// separate REST roundtrip. `lastEventBlock` lets the client detect gaps by
// comparing with the blockNumber of the first live event it receives.
export type WsSnapshotData = {
	marketAddress: string
	lastEventBlock: number
	totalPool: string
	totalPerOutcome: string[]
	odds: number[]
	status: string
	winningOutcome: number | null
	recentBets: WsBetData[]
}

// Server -> Client
export type WsServerMessage =
	| { type: 'snapshot'; data: WsSnapshotData }
	| { type: 'bet'; data: WsBetData }
	| { type: 'odds_update'; data: WsOddsUpdateData }
	| { type: 'status_change'; data: WsStatusChangeData }
	| { type: 'claim'; data: WsClaimData }
	| { type: 'counter_update'; data: WsCounterUpdateData }
	| { type: 'error'; data: { message: string } }

// Global feed wraps any server message with the market address
export type WsGlobalMessage = WsServerMessage & { marketAddress: string }
