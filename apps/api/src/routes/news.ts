import { Hono } from 'hono'

const app = new Hono()

interface NewsArticle {
  title: string
  source: string
  imageUrl: string
  url: string
  category: string
  publishedAt: number
}

let cache: { articles: NewsArticle[]; fetchedAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 min

async function fetchNews(): Promise<NewsArticle[]> {
  // Check cache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.articles
  }

  try {
    const res = await fetch(
      'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&excludeCategories=Sponsored',
    )
    if (!res.ok) return cache?.articles ?? []

    const data: any = await res.json()
    const items = data?.Data ?? []

    const articles: NewsArticle[] = items.slice(0, 12).map((item: any) => ({
      title: item.title ?? '',
      source: item.source_info?.name ?? item.source ?? '',
      imageUrl: item.imageurl ?? '',
      url: item.url ?? '',
      category: (item.categories ?? '').split('|')[0] || 'Crypto',
      publishedAt: item.published_on ?? 0,
    }))

    cache = { articles, fetchedAt: Date.now() }
    return articles
  } catch {
    return cache?.articles ?? []
  }
}

// GET /api/news
app.get('/', async (c) => {
  const articles = await fetchNews()
  return c.json({ articles })
})

export default app
