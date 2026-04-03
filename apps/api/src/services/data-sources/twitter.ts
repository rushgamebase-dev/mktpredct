import { eq } from 'drizzle-orm'
import { markets, counterState } from '@rush/shared/db/schema'
import type { WsGlobalMessage } from '@rush/shared'
import { db } from '../../db.js'
import { broadcast } from '../../ws/broadcast.js'

const TWITTER_API_KEY = 'new1_3885f5f64e984cb2b45d5d8e0bb0899c'
const POLL_INTERVAL = 60_000 // 60 seconds

interface TweetData {
  id: string
  text: string
  createdAt: string
  likeCount: number
  retweetCount: number
}

// In-memory cache to avoid DB hits on every poll
const cache: Record<string, {
  count: number
  ratePerHour: number
  projected: number
  lastEventAt: number
  lastTweetId: string | null
  hourly: number[]
  tweets: TweetData[]
}> = {}

// Export cache so counter route can access tweets
export function getCachedTweets(marketAddress: string): TweetData[] {
  return cache[marketAddress]?.tweets ?? []
}

async function fetchTweets(username: string): Promise<TweetData[]> {
  try {
    const res = await fetch(
      `https://api.twitterapi.io/twitter/user/last_tweets?userName=${username}`,
      { headers: { 'X-API-Key': TWITTER_API_KEY } },
    )
    if (!res.ok) return []
    const data: any = await res.json()
    return (data?.data?.tweets ?? []).map((t: any) => ({
      id: t.id,
      text: t.text,
      createdAt: t.createdAt,
      likeCount: t.likeCount ?? 0,
      retweetCount: t.retweetCount ?? 0,
    }))
  } catch {
    return []
  }
}

function filterToday(tweets: TweetData[]): TweetData[] {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const todayTweets = tweets.filter((t) => {
    try {
      return new Date(t.createdAt).toISOString().slice(0, 10) === todayStr
    } catch { return false }
  })
  // Fallback to last 24h if today is empty
  if (todayTweets.length === 0) {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    return tweets.filter((t) => {
      try { return new Date(t.createdAt) >= cutoff } catch { return false }
    })
  }
  return todayTweets
}

function buildHourly(tweets: TweetData[]): number[] {
  const hourly = new Array(24).fill(0)
  tweets.forEach((t) => {
    try {
      const h = new Date(t.createdAt).getUTCHours()
      hourly[h] += 1
    } catch { /* skip */ }
  })
  return hourly
}

async function pollTwitterSource(marketAddress: string, target: string): Promise<void> {
  const tweets = await fetchTweets(target)
  if (tweets.length === 0) return

  const todayTweets = filterToday(tweets)
  const count = todayTweets.length
  const hourly = buildHourly(todayTweets)

  // Compute rate
  const hoursPassed = Math.max(0.5, new Date().getUTCHours() + new Date().getUTCMinutes() / 60)
  const ratePerHour = count / hoursPassed
  const projected = Math.round(ratePerHour * 24)

  // Last event
  let lastEventAt = 0
  if (todayTweets.length > 0) {
    try {
      lastEventAt = Math.floor(new Date(todayTweets[0].createdAt).getTime() / 1000)
    } catch { /* skip */ }
  }

  // Check if count changed (for delta)
  const prev = cache[marketAddress]
  const delta = prev ? count - prev.count : 0
  const lastTweetId = todayTweets[0]?.id ?? null

  // Skip if no change
  if (prev && lastTweetId === prev.lastTweetId) return

  // Update cache (includes tweets for feed)
  cache[marketAddress] = {
    count,
    ratePerHour,
    projected,
    lastEventAt,
    lastTweetId,
    hourly,
    tweets: todayTweets,
  }

  // Persist to DB
  try {
    await db.insert(counterState).values({
      marketAddress,
      currentCount: count,
      ratePerHour: ratePerHour.toFixed(2),
      projected,
      lastEventAt,
      timeline: JSON.stringify(hourly.map((c, h) => ({ hour: h, count: c }))),
    }).onConflictDoUpdate({
      target: counterState.marketAddress,
      set: {
        currentCount: count,
        ratePerHour: ratePerHour.toFixed(2),
        projected,
        lastEventAt,
        timeline: JSON.stringify(hourly.map((c, h) => ({ hour: h, count: c }))),
      },
    })
  } catch (e) {
    console.error('[Twitter] DB update error:', e)
  }

  // Broadcast via WebSocket (per-market + global)
  if (delta !== 0 || !prev) {
    const msg = {
      type: 'counter_update' as const,
      data: {
        currentCount: count,
        ratePerHour: Math.round(ratePerHour * 10) / 10,
        projected,
        lastEventAt,
        delta,
      },
    }
    broadcast.emit(marketAddress, msg)
    broadcast.emit('__global', { ...msg, marketAddress } as WsGlobalMessage)
  }

  console.log(`[Twitter] @${target}: ${count} tweets today (Δ${delta > 0 ? '+' : ''}${delta}) | rate ${ratePerHour.toFixed(1)}/hr | projected ${projected}`)
}

// ---------------------------------------------------------------------------
// Main poller — starts all twitter counter sources
// ---------------------------------------------------------------------------

export async function startTwitterPollers(): Promise<void> {
  // Find all counter markets with twitter source
  const counterMarkets = await db.select().from(markets)
    .where(eq(markets.marketType, 'counter'))

  const twitterMarkets = counterMarkets.filter((m) => {
    const config = m.sourceConfig as Record<string, unknown> | null
    return config?.type === 'twitter' && config?.target
  })

  if (twitterMarkets.length === 0) {
    console.log('[Twitter] No twitter counter markets found')
    return
  }

  console.log(`[Twitter] Starting pollers for ${twitterMarkets.length} market(s)`)

  // Initial poll
  for (const m of twitterMarkets) {
    const config = m.sourceConfig as Record<string, unknown>
    const target = config.target as string
    try {
      await pollTwitterSource(m.address, target)
    } catch (e) {
      console.error(`[Twitter] Initial poll error for ${target}:`, e)
    }
  }

  // Recurring poll
  setInterval(async () => {
    for (const m of twitterMarkets) {
      const config = m.sourceConfig as Record<string, unknown>
      const target = config.target as string
      try {
        await pollTwitterSource(m.address, target)
      } catch (e) {
        console.error(`[Twitter] Poll error for ${target}:`, e)
      }
    }
  }, POLL_INTERVAL)
}
