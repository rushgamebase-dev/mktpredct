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
const CACHE_TTL = 2 * 60 * 1000 // 2 min — fast refresh

async function fetchNews(): Promise<NewsArticle[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.articles
  }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/news?page=1')
    if (!res.ok) return cache?.articles ?? []

    const data: any = await res.json()
    const items = data?.data ?? []

    const articles: NewsArticle[] = items.slice(0, 12).map((item: any) => ({
      title: item.title ?? '',
      source: item.author ?? '',
      imageUrl: item.thumb_2x ?? '',
      url: item.url ?? '',
      category: (item.categories ?? []).join(', ') || 'Crypto',
      publishedAt: item.updated_at
        ? Math.floor(new Date(item.updated_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
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
