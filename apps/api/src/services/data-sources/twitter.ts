import WebSocket from 'ws'
import { eq } from 'drizzle-orm'
import { markets, counterState } from '@rush/shared/db/schema'
import type { WsGlobalMessage } from '@rush/shared'
import { db } from '../../db.js'
import { broadcast } from '../../ws/broadcast.js'

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || ''
const TWITTER_WS_URL = 'wss://ws.twitterapi.io/twitter/tweet/websocket'
const POLL_INTERVAL = 60_000 // Fallback polling interval

interface TweetData {
  id: string
  text: string
  createdAt: string
  likeCount: number
  retweetCount: number
}

// In-memory cache
const cache: Record<string, {
  count: number
  ratePerHour: number
  projected: number
  lastEventAt: number
  lastTweetId: string | null
  hourly: number[]
  tweets: TweetData[]
}> = {}

// Market config: target → { marketAddress, keyword }
const marketsByTarget: Record<string, { address: string; keyword?: string }> = {}

export function getCachedTweets(marketAddress: string): TweetData[] {
  return cache[marketAddress]?.tweets ?? []
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function filterToday(tweets: TweetData[]): TweetData[] {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const todayTweets = tweets.filter((t) => {
    try {
      return new Date(t.createdAt).toISOString().slice(0, 10) === todayStr
    } catch { return false }
  })
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

function updateMarketCounter(marketAddress: string, target: string, keyword?: string): void {
  const c = cache[marketAddress]
  if (!c) return

  const count = c.count
  const hourly = c.hourly
  const hoursPassed = Math.max(0.5, new Date().getUTCHours() + new Date().getUTCMinutes() / 60)
  const ratePerHour = count / hoursPassed
  const projected = Math.round(ratePerHour * 24)

  let lastEventAt = 0
  if (c.tweets.length > 0) {
    try {
      lastEventAt = Math.floor(new Date(c.tweets[0].createdAt).getTime() / 1000)
    } catch { /* skip */ }
  }

  const prev = { ...c }
  const delta = prev.count !== count ? count - prev.count : 1

  cache[marketAddress] = { ...c, ratePerHour, projected, lastEventAt, hourly }

  // DB persist
  db.insert(counterState).values({
    marketAddress,
    currentCount: count,
    ratePerHour: ratePerHour.toFixed(2),
    projected,
    lastEventAt,
    timeline: JSON.stringify(hourly.map((cnt, h) => ({ hour: h, count: cnt }))),
  }).onConflictDoUpdate({
    target: counterState.marketAddress,
    set: {
      currentCount: count,
      ratePerHour: ratePerHour.toFixed(2),
      projected,
      lastEventAt,
      timeline: JSON.stringify(hourly.map((cnt, h) => ({ hour: h, count: cnt }))),
    },
  }).catch((e) => console.error('[Twitter] DB update error:', e))

  // Broadcast
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

  console.log(`[Twitter] @${target}${keyword ? `[${keyword}]` : ''}: ${count} tweets (Δ+${delta}) | rate ${ratePerHour.toFixed(1)}/hr | projected ${projected}`)
}

// ---------------------------------------------------------------------------
// WebSocket Stream — real-time (~1.2s latency)
// ---------------------------------------------------------------------------

let wsConnection: WebSocket | null = null
let reconnectAttempt = 0

function connectTwitterStream(): void {
  if (!TWITTER_API_KEY) {
    console.log('[Twitter] No API key, skipping WS stream')
    return
  }

  console.log('[Twitter] Connecting to WebSocket stream...')

  const ws = new WebSocket(TWITTER_WS_URL, {
    headers: { 'x-api-key': TWITTER_API_KEY },
  })

  ws.on('open', () => {
    reconnectAttempt = 0
    console.log('[Twitter] WebSocket stream connected')
    wsConnection = ws
  })

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString())

      if (msg.event_type === 'connected') {
        console.log('[Twitter] Stream confirmed connected')
        return
      }
      if (msg.event_type === 'ping') return

      if (msg.event_type === 'tweet') {
        const tweets = msg.tweets ?? []
        for (const rawTweet of tweets) {
          const screenName = (rawTweet.author?.userName ?? rawTweet.user?.screen_name ?? '').toLowerCase()
          const tweetText = rawTweet.text ?? ''
          const tweetId = rawTweet.id ?? ''
          const createdAt = rawTweet.createdAt ?? rawTweet.created_at ?? new Date().toISOString()

          console.log(`[Twitter] WS tweet from @${screenName}: "${tweetText.slice(0, 50)}..."`)

          // Find which market(s) this target belongs to
          for (const [target, config] of Object.entries(marketsByTarget)) {
            if (screenName !== target.toLowerCase()) continue

            // Keyword filter
            if (config.keyword && !tweetText.toLowerCase().includes(config.keyword.toLowerCase())) {
              console.log(`[Twitter] Skipped: @${screenName} tweet doesn't contain "${config.keyword}"`)
              continue
            }

            const tweet: TweetData = {
              id: tweetId,
              text: tweetText,
              createdAt,
              likeCount: rawTweet.likeCount ?? 0,
              retweetCount: rawTweet.retweetCount ?? 0,
            }

            // Add to cache
            if (!cache[config.address]) {
              cache[config.address] = {
                count: 0, ratePerHour: 0, projected: 0,
                lastEventAt: 0, lastTweetId: null, hourly: new Array(24).fill(0), tweets: [],
              }
            }

            const c = cache[config.address]
            // Dedup by tweet ID
            if (c.tweets.some((t) => t.id === tweet.id)) continue

            c.tweets.unshift(tweet)
            c.tweets = filterToday(c.tweets)
            c.count = c.tweets.length
            c.hourly = buildHourly(c.tweets)
            c.lastTweetId = tweet.id

            updateMarketCounter(config.address, target, config.keyword)
          }
        }
      }
    } catch (e) {
      console.error('[Twitter] WS message parse error:', e)
    }
  })

  ws.on('close', (code, reason) => {
    console.log(`[Twitter] WS stream closed: ${code} ${reason}`)
    wsConnection = null
    scheduleReconnect()
  })

  ws.on('error', (err) => {
    console.error('[Twitter] WS stream error:', err.message)
    wsConnection = null
  })
}

function scheduleReconnect(): void {
  const delay = Math.min(1000 * 2 ** reconnectAttempt, 30_000)
  reconnectAttempt++
  console.log(`[Twitter] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempt})...`)
  setTimeout(connectTwitterStream, delay)
}

// ---------------------------------------------------------------------------
// Polling fallback — initial load + recovery
// ---------------------------------------------------------------------------

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

async function pollOnce(marketAddress: string, target: string, keyword?: string): Promise<void> {
  const tweets = await fetchTweets(target)
  if (tweets.length === 0) return

  let todayTweets = filterToday(tweets)
  if (keyword) {
    todayTweets = todayTweets.filter((t) => t.text.toLowerCase().includes(keyword.toLowerCase()))
  }

  const prev = cache[marketAddress]
  const lastTweetId = todayTweets[0]?.id ?? null
  if (prev && lastTweetId === prev.lastTweetId) return

  cache[marketAddress] = {
    count: todayTweets.length,
    ratePerHour: 0,
    projected: 0,
    lastEventAt: 0,
    lastTweetId,
    hourly: buildHourly(todayTweets),
    tweets: todayTweets,
  }

  updateMarketCounter(marketAddress, target, keyword)
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

export async function startTwitterPollers(): Promise<void> {
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

  // Build target → market mapping
  for (const m of twitterMarkets) {
    const config = m.sourceConfig as Record<string, unknown>
    const target = (config.target as string).toLowerCase()
    marketsByTarget[target] = {
      address: m.address,
      keyword: config.keyword as string | undefined,
    }
  }

  console.log(`[Twitter] ${twitterMarkets.length} market(s): ${Object.keys(marketsByTarget).map((t) => `@${t}`).join(', ')}`)

  // Initial poll (bootstrap cache with existing tweets)
  for (const m of twitterMarkets) {
    const config = m.sourceConfig as Record<string, unknown>
    const target = config.target as string
    const keyword = config.keyword as string | undefined
    try {
      await pollOnce(m.address, target, keyword)
    } catch (e) {
      console.error(`[Twitter] Initial poll error for ${target}:`, e)
    }
  }

  // Connect WebSocket stream (primary real-time source)
  connectTwitterStream()

  // Fallback polling (recovery if WS drops)
  setInterval(async () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) return // WS is healthy, skip polling
    console.log('[Twitter] Fallback polling (WS not connected)')
    for (const m of twitterMarkets) {
      const config = m.sourceConfig as Record<string, unknown>
      try {
        await pollOnce(m.address, config.target as string, config.keyword as string | undefined)
      } catch (e) {
        console.error(`[Twitter] Fallback poll error:`, e)
      }
    }
  }, POLL_INTERVAL)
}
