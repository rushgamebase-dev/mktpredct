export type ProposalStatus = 'pending' | 'approved' | 'rejected'
export type PayoutStatus = 'pending' | 'paid'

export interface MarketProposal {
	id: number
	proposerAddress: string
	question: string
	labels: string[]
	deadline: number
	gracePeriod: number
	marketType: 'classic' | 'counter' | 'price' | 'event'
	sourceConfig: Record<string, unknown> | null
	rationale: string | null
	status: ProposalStatus
	rejectReason: string | null
	marketAddress: string | null
	adminNotes: string | null
	createdAt: number
	reviewedAt: number | null
}

export interface ProposerPayout {
	id: number
	proposerAddress: string
	marketAddress: string
	feeEventId: number
	feeAmount: string
	proposerShare: string
	status: PayoutStatus
	payoutTxHash: string | null
	createdAt: number
	paidAt: number | null
}

// POST /api/proposals
export interface CreateProposalRequest {
	question: string
	labels: string[]
	deadline: number
	gracePeriod: number
	marketType?: 'classic' | 'counter' | 'price' | 'event'
	sourceConfig?: Record<string, unknown>
	rationale?: string
	proposerAddress: string
	signature: string
	timestamp: number
}

// GET /api/proposals
export interface ProposalsListResponse {
	proposals: MarketProposal[]
	total: number
	page: number
	pageSize: number
}

// POST /api/admin/proposals/:id/approve
export interface ApproveProposalRequest {
	feeShareBps?: number
	adminNotes?: string
}

export interface ApproveProposalResponse {
	txHash: string
	marketAddress: string
	proposalId: number
}

// POST /api/admin/proposals/:id/reject
export interface RejectProposalRequest {
	reason: string
	adminNotes?: string
}

// GET /api/proposals/earnings/:address
export interface ProposerEarningsResponse {
	proposerAddress: string
	totalEarned: string
	totalPending: string
	proposalsCount: number
	approvedCount: number
}

// GET /api/admin/proposer-payouts
export interface ProposerPayoutSummary {
	proposerAddress: string
	totalOwed: string
	totalPaid: string
	pendingCount: number
}

export interface ProposerPayoutsResponse {
	summaries: ProposerPayoutSummary[]
}

// POST /api/admin/proposer-payouts/batch
export interface BatchPayoutRequest {
	proposerAddress: string
	amount: string
}

export interface BatchPayoutResponse {
	txHash: string
	proposerAddress: string
	amount: string
}
