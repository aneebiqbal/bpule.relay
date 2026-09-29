import type { SourceAdapter, RawTrendSignal, TrendStore } from '../types'

const HN_API = 'https://hacker-news.firebaseio.com/v0'
const FETCH_TIMEOUT = 8000
const STORY_LIMIT = 30

interface HnItem {
  id: number
  title: string
  url?: string
  score?: number
  by?: string
  time?: number
  descendants?: number
  type?: string
}

async function fetchHnIds(endpoint: 'topstories' | 'beststories' | 'newstories'): Promise<number[]> {
  const res = await fetch(`${HN_API}/${endpoint}.json`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) throw new Error(`HN ${endpoint} failed: ${res.status}`)
  return (await res.json()) as number[]
}

async function fetchHnItem(id: number): Promise<HnItem | null> {
  const res = await fetch(`${HN_API}/item/${id}.json`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  if (!res.ok) return null
  return (await res.json()) as HnItem
}

export function hackernewsTopAdapter(): SourceAdapter {
  return {
    sourceType: 'hackernews',
    sourceKey: 'hackernews-top',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const ids = (await fetchHnIds('topstories')).slice(0, STORY_LIMIT)
      const items = await Promise.all(ids.map(fetchHnItem))
      return items
        .filter((i): i is HnItem => i != null && i.type === 'story' && !!i.title)
        .map(item => ({
          source: 'hackernews',
          sourceType: 'hackernews' as const,
          sourceItemId: String(item.id),
          url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
          title: item.title,
          author: item.by,
          publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
          tags: inferHnTopics(item.title),
          metrics: {
            score: item.score ?? 0,
            comments: item.descendants ?? 0,
          },
        }))
    },
  }
}

export function hackernewsBestAdapter(): SourceAdapter {
  return {
    sourceType: 'hackernews',
    sourceKey: 'hackernews-best',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const ids = (await fetchHnIds('beststories')).slice(0, 20)
      const items = await Promise.all(ids.map(fetchHnItem))
      return items
        .filter((i): i is HnItem => i != null && i.type === 'story' && !!i.title)
        .map(item => ({
          source: 'hackernews',
          sourceType: 'hackernews' as const,
          sourceItemId: String(item.id),
          url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
          title: item.title,
          author: item.by,
          publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
          tags: inferHnTopics(item.title),
          metrics: {
            score: item.score ?? 0,
            comments: item.descendants ?? 0,
          },
        }))
    },
  }
}

export function hackernewsNewAdapter(): SourceAdapter {
  return {
    sourceType: 'hackernews',
    sourceKey: 'hackernews-new',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const ids = (await fetchHnIds('newstories')).slice(0, 25)
      const items = await Promise.all(ids.map(fetchHnItem))
      return items
        .filter((i): i is HnItem => i != null && i.type === 'story' && !!i.title)
        .map(item => ({
          source: 'hackernews',
          sourceType: 'hackernews' as const,
          sourceItemId: String(item.id),
          url: item.url ?? `https://news.ycombinator.com/item?id=${item.id}`,
          title: item.title,
          author: item.by,
          publishedAt: item.time ? new Date(item.time * 1000).toISOString() : undefined,
          tags: inferHnTopics(item.title),
          metrics: {
            score: item.score ?? 0,
            comments: item.descendants ?? 0,
          },
        }))
    },
  }
}

function inferHnTopics(title: string): string[] {
  const lower = title.toLowerCase()
  const topics: string[] = []
  const patterns: [string, string[]][] = [
    ['ai', ['ai', 'llm', 'gpt', 'model', 'neural', 'ml ', 'machine learning', 'agent', 'transformer']],
    ['software-engineering', ['rust', 'go ', 'typescript', 'javascript', 'python', 'refactor', 'codebase', 'compiler', 'framework']],
    ['startups', ['startup', 'founder', 'seed', 'series', 'vc ', 'funding', 'bootstrapped']],
    ['security', ['cve', 'vulnerability', 'exploit', 'ransomware', 'zero-day', 'security', 'breach']],
    ['infrastructure', ['kubernetes', 'docker', 'aws', 'cloud', 'database', 'postgres', 'redis', 'serverless']],
    ['devops', ['ci/cd', 'deploy', 'pipeline', 'observability', 'monitoring', 'terraform']],
    ['web', ['browser', 'css', 'html', 'react', 'nextjs', 'frontend', 'dom', 'webapi']],
    ['open-source', ['open source', 'github', 'license', 'oss ', 'foss']],
    ['developer-tools', ['cli', 'editor', 'ide', 'debug', 'tooling', 'sdk', 'api']],
    ['product', ['product', 'ux', 'design', 'user experience', 'launch']],
  ]
  for (const [topic, keywords] of patterns) {
    if (keywords.some(kw => lower.includes(kw))) topics.push(topic)
  }
  if (topics.length === 0) topics.push('general')
  return topics
}
