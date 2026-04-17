import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { markets } from '@rush/shared/db/schema'
import { computeOdds } from '@rush/shared'
import { db } from '../db.js'

const app = new Hono()

function formatDeadline(deadline: number): string {
	const now = Math.floor(Date.now() / 1000)
	const diff = deadline - now
	if (diff <= 0) return 'Ended'
	if (diff < 3600) return `${Math.floor(diff / 60)}m left`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h left`
	return `${Math.floor(diff / 86400)}d left`
}

function formatPool(wei: string): string {
	const n = Number(BigInt(wei)) / 1e18
	if (n === 0) return ''
	if (n >= 1) return `${n.toFixed(2)} ETH pool`
	if (n >= 0.01) return `${n.toFixed(3)} ETH pool`
	return ''
}

// GET /api/og/:address — generates 1200x630 PNG for Twitter/OG cards
app.get('/:address', async (c) => {
	const address = c.req.param('address').toLowerCase()

	const [market] = await db
		.select()
		.from(markets)
		.where(eq(markets.address, address))
		.limit(1)

	if (!market) {
		return c.text('Market not found', 404)
	}

	const perOutcome = market.totalPerOutcome as string[]
	const odds = computeOdds(perOutcome, market.totalPool)
	const yesLabel = (market.labels as string[])[0] ?? 'Yes'
	const noLabel = (market.labels as string[])[1] ?? 'No'
	const yesOdds = Math.round(odds[0] ?? 50)
	const noOdds = Math.round(odds[1] ?? 50)
	const timer = formatDeadline(market.deadline)
	const pool = formatPool(market.totalPool)
	const isLive = market.status === 'open'
	const q = market.question

	const fontSize = q.length > 60 ? 42 : q.length > 40 ? 48 : 56

	const element = {
		type: 'div',
		props: {
			style: {
				width: 1200,
				height: 630,
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				alignItems: 'center',
				background: 'linear-gradient(180deg, #0d0d0d 0%, #111111 100%)',
				fontFamily: 'sans-serif',
				padding: '60px 80px',
				position: 'relative',
			},
			children: [
				// Top bar
				{
					type: 'div',
					props: {
						style: {
							position: 'absolute',
							top: 40,
							left: 80,
							right: 80,
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
						},
						children: [
							{
								type: 'div',
								props: {
									style: { display: 'flex', alignItems: 'center', gap: 12 },
									children: [
										{ type: 'span', props: { style: { fontSize: 24, fontWeight: 900, letterSpacing: '0.15em', color: '#00ff88' }, children: 'RUSH' } },
										{ type: 'span', props: { style: { fontSize: 16, color: '#666' }, children: 'Prediction Markets' } },
									],
								},
							},
							{
								type: 'div',
								props: {
									style: { display: 'flex', alignItems: 'center', gap: 16 },
									children: [
										...(isLive ? [{
											type: 'div',
											props: {
												style: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: 14, fontWeight: 700, color: '#00ff88' },
												children: '● LIVE',
											},
										}] : []),
										...(timer !== 'Ended' ? [{
											type: 'span',
											props: { style: { fontSize: 16, fontWeight: 700, color: '#999' }, children: `⏱ ${timer}` },
										}] : []),
									],
								},
							},
						],
					},
				},
				// Question
				{
					type: 'div',
					props: {
						style: { fontSize, fontWeight: 900, color: '#ffffff', textAlign: 'center', lineHeight: 1.2, maxWidth: 1000, marginBottom: 48 },
						children: q,
					},
				},
				// YES vs NO
				{
					type: 'div',
					props: {
						style: { display: 'flex', alignItems: 'center', gap: 60, marginBottom: 32 },
						children: [
							{
								type: 'div',
								props: {
									style: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
									children: [
										{ type: 'div', props: { style: { fontSize: 20, fontWeight: 700, color: '#00ff88', letterSpacing: '0.1em', marginBottom: 4 }, children: yesLabel.toUpperCase() } },
										{ type: 'div', props: { style: { fontSize: 72, fontWeight: 900, color: '#00ff88', lineHeight: 1 }, children: `${yesOdds}%` } },
									],
								},
							},
							{
								type: 'div',
								props: { style: { width: 2, height: 80, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.15), transparent)' }, children: '' },
							},
							{
								type: 'div',
								props: {
									style: { textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
									children: [
										{ type: 'div', props: { style: { fontSize: 20, fontWeight: 700, color: '#EF4444', letterSpacing: '0.1em', marginBottom: 4 }, children: noLabel.toUpperCase() } },
										{ type: 'div', props: { style: { fontSize: 72, fontWeight: 900, color: '#EF4444', lineHeight: 1 }, children: `${noOdds}%` } },
									],
								},
							},
						],
					},
				},
				// Progress bar
				{
					type: 'div',
					props: {
						style: { width: 600, height: 8, borderRadius: 4, display: 'flex', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', marginBottom: 24 },
						children: [
							{ type: 'div', props: { style: { width: `${yesOdds}%`, height: '100%', background: 'rgba(0,255,136,0.6)' }, children: '' } },
							{ type: 'div', props: { style: { width: `${noOdds}%`, height: '100%', background: 'rgba(239,68,68,0.6)' }, children: '' } },
						],
					},
				},
				// Bottom bar
				{
					type: 'div',
					props: {
						style: { position: 'absolute', bottom: 40, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
						children: [
							{ type: 'span', props: { style: { fontSize: 16, color: '#666' }, children: `${pool ? `${pool} · ` : ''}markets.rushgame.vip` } },
							{
								type: 'div',
								props: {
									style: { fontSize: 18, fontWeight: 800, color: '#00ff88', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 12, padding: '8px 24px' },
									children: 'Take a side →',
								},
							},
						],
					},
				},
			],
		},
	}

	const svg = await satori(element as any, {
		width: 1200,
		height: 630,
		fonts: [],
	})

	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: 1200 },
	})
	const png = resvg.render().asPng()

	return new Response(png, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=300, s-maxage=300',
		},
	})
})

export default app
