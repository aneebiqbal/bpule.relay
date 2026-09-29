import type { SourceAdapter, RawTrendSignal, TrendStore } from '../types'

const DEV_API = 'https://dev.to/api'
const FETCH_TIMEOUT = 8000
const PAGE_LIMIT = 30

interface DevArticle {
  id: number
  title: string
  description?: string
  url?: string
  user?: { name?: string }
  published_at?: string
  tags?: string
  positive_reactions_count?: number
  comments_count?: number
  reading_time_minutes?: number
}

async function fetchDev(endpoint: string, params?: Record<string, string>): Promise<DevArticle[]> {
  const url = new URL(`${DEV_API}${endpoint}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`DEV ${endpoint} failed: ${res.status}`)
  return (await res.json()) as DevArticle[]
}

export function devtoPopularAdapter(): SourceAdapter {
  return {
    sourceType: 'devto',
    sourceKey: 'devto-popular',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const articles = await fetchDev('/articles', { top: '7', per_page: String(PAGE_LIMIT) })
      return articles.map(a => ({
        source: 'devto',
        sourceType: 'devto' as const,
        sourceItemId: String(a.id),
        url: a.url,
        title: a.title,
        excerpt: a.description,
        author: a.user?.name,
        publishedAt: a.published_at,
        tags: a.tags ? a.tags.split(',').map(t => t.trim().toLowerCase()) : [],
        metrics: {
          reactions: a.positive_reactions_count ?? 0,
          comments: a.comments_count ?? 0,
          readingTime: a.reading_time_minutes ?? 0,
        },
      }))
    },
  }
}

export function devtoLatestAdapter(): SourceAdapter {
  return {
    sourceType: 'devto',
    sourceKey: 'devto-latest',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const articles = await fetchDev('/articles/latest', { per_page: String(PAGE_LIMIT) })
      return articles.map(a => ({
        source: 'devto',
        sourceType: 'devto' as const,
        sourceItemId: String(a.id),
        url: a.url,
        title: a.title,
        excerpt: a.description,
        author: a.user?.name,
        publishedAt: a.published_at,
        tags: a.tags ? a.tags.split(',').map(t => t.trim().toLowerCase()) : [],
        metrics: {
          reactions: a.positive_reactions_count ?? 0,
          comments: a.comments_count ?? 0,
          readingTime: a.reading_time_minutes ?? 0,
        },
      }))
    },
  }
}
