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

// Comments
export interface Comment {
	id: number
	marketAddress: string
	userAddress: string
	content: string
	createdAt: number
}
export interface CommentsResponse { comments: Comment[] }
export interface CreateCommentRequest { content: string; signature: string }

// User
export interface UserProfile {
	address: string
	totalBets: number
	totalVolume: string
	totalPnl: string
	wins: number
	losses: number
	winRate: number
	lastActive: number
}
export interface UserPositionsListResponse { positions: { marketAddress: string; question: string; outcomeIndex: number; amount: string; label: string }[] }

// Leaderboard
export interface LeaderboardEntry { address: string; pnl: string; volume: string; winRate: number; bets: number }
export interface LeaderboardResponse { entries: LeaderboardEntry[]; period: string }

// Market Stats
export interface MarketStatsResponse {
	totalBettors: number
	largestBet: string
	volume24h: string
	bets24h: number
	momentum: string
	yesPercentBettors: number
	noPercentBettors: number
}

// Counter
export interface CounterResponse {
	currentCount: number
	ratePerHour: number
	projected: number
	lastEventAt: number
	timeline: { hour: number; count: number }[]
}

// Notifications
export interface Notification { id: number; type: string; title: string; body: string | null; marketAddress: string | null; read: boolean; createdAt: number }
export interface NotificationsResponse { notifications: Notification[] }
