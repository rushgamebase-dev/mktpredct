export const CHAIN_ID = 8453 // Base mainnet

export const OUTCOME_COLORS = [
	'#00ff88',
	'#ff4444',
	'#ffc828',
	'#5078ff',
	'#ff6b9d',
	'#a78bfa',
	'#38bdf8',
	'#fb923c',
	'#34d399',
	'#e879f9',
] as const

export const STATUS_MAP = {
	0: 'open',
	1: 'resolved',
	2: 'cancelled',
	3: 'expired',
} as const

export type MarketStatus = (typeof STATUS_MAP)[keyof typeof STATUS_MAP]
