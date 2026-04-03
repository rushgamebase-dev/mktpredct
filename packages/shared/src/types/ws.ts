// Server -> Client
export type WsServerMessage =
	| {
			type: 'bet'
			data: {
				user: string
				outcomeIndex: number
				amount: string
				txHash: string
				timestamp: number
			}
	  }
	| {
			type: 'odds_update'
			data: {
				totalPool: string
				totalPerOutcome: string[]
				odds: number[]
			}
	  }
	| {
			type: 'status_change'
			data: {
				status: string
				winningOutcome: number | null
			}
	  }
	| {
			type: 'claim'
			data: {
				user: string
				payout: string
			}
	  }
	| {
			type: 'counter_update'
			data: {
				currentCount: number
				ratePerHour: number
				projected: number
				lastEventAt: number
				delta: number
			}
	  }
	| {
			type: 'error'
			data: { message: string }
	  }
