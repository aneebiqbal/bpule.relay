import type { SourceAdapter, RawTrendSignal, TrendStore } from '../types'

const LOBSTERS_API = 'https://lobste.rs'
const FETCH_TIMEOUT = 8000

interface LobstersStory {
  short_id: string
  title: string
  url: string
  score: number
  comments_count: number
  created_at: string
  tags: string[]
  user: { username: string }
}

export function lobstersHotAdapter(): SourceAdapter {
  return {
    sourceType: 'lobsters',
    sourceKey: 'lobsters-hot',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const res = await fetch(`${LOBSTERS_API}/hot.json`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`Lobsters failed: ${res.status}`)
      const stories = (await res.json()) as LobstersStory[]

      return stories.slice(0, 25).map(story => ({
        source: 'lobsters',
        sourceType: 'lobsters' as const,
        sourceItemId: `lobsters-${story.short_id}`,
        url: story.url,
        title: story.title,
        author: story.user?.username,
        publishedAt: story.created_at,
        tags: story.tags.map(t => t.toLowerCase()),
        metrics: {
          score: story.score,
          comments: story.comments_count,
        },
      }))
    },
  }
}

export function lobstersNewestAdapter(): SourceAdapter {
  return {
    sourceType: 'lobsters',
    sourceKey: 'lobsters-newest',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const res = await fetch(`${LOBSTERS_API}/newest.json`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`Lobsters failed: ${res.status}`)
      const stories = (await res.json()) as LobstersStory[]

      return stories.slice(0, 20).map(story => ({
        source: 'lobsters',
        sourceType: 'lobsters' as const,
        sourceItemId: `lobsters-${story.short_id}`,
        url: story.url,
        title: story.title,
        author: story.user?.username,
        publishedAt: story.created_at,
        tags: story.tags.map(t => t.toLowerCase()),
        metrics: {
          score: story.score,
          comments: story.comments_count,
        },
      }))
    },
  }
}
