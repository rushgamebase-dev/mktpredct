import type { MarketSummary, MarketDetail, BetEvent, ClaimEvent, UserPositions, OddsPoint } from './market'

// GET /api/markets
export interface MarketsListResponse {
	markets: MarketSummary[]
	total: number
	page: number
	pageSize: number
}

export interface MarketsListQuery {
	page?: number
	pageSize?: number
	status?: 'open' | 'resolved' | 'cancelled' | 'expired' | 'all'
}

// GET /api/markets/:address
export type MarketDetailResponse = MarketDetail

// GET /api/markets/:address/activity
export interface ActivityResponse {
	bets: BetEvent[]
	claims: ClaimEvent[]
}

// GET /api/markets/:address/positions/:user
export type UserPositionsResponse = UserPositions

// GET /api/markets/:address/chart
export interface ChartResponse {
	points: OddsPoint[]
}

// POST /api/admin/markets
export interface CreateMarketRequest {
	question: string
	labels: string[]
	deadline: number
	gracePeriod: number
	marketType?: 'classic' | 'counter' | 'price' | 'event'
	sourceConfig?: Record<string, unknown>
}

export interface CreateMarketResponse {
	txHash: string
	marketAddress: string
}

// POST /api/admin/markets/:address/resolve
export interface ResolveMarketRequest {
	winningOutcome: number
}

export interface TxResponse {
	txHash: string
}
