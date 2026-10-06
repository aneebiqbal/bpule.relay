import type { SourceAdapter, RawTrendSignal, TrendStore } from '../types'

const REDDIT_API = 'https://www.reddit.com'
const FETCH_TIMEOUT = 10000

interface RedditPost {
  data: {
    id: string
    title: string
    selftext: string
    url: string
    permalink: string
    author: string
    created_utc: number
    score: number
    num_comments: number
    subreddit: string
    link_flair_text?: string
  }
}

function inferRedditTopics(title: string, subreddit: string): string[] {
  const lower = title.toLowerCase()
  const topics: string[] = []

  const subredditMap: Record<string, string> = {
    'programming': 'software-engineering',
    'machinelearning': 'ai',
    'artificial': 'ai',
    'devops': 'devops',
    'kubernetes': 'infrastructure',
    'rust': 'software-engineering',
    'golang': 'software-engineering',
    'react': 'web',
    'webdev': 'web',
    'sysadmin': 'infrastructure',
    'security': 'security',
    'netsec': 'security',
    'startups': 'startups',
    'entrepreneur': 'startups',
  }

  const mapped = subredditMap[subreddit.toLowerCase()]
  if (mapped) topics.push(mapped)

  const keywordTopics: [string, string[]][] = [
    ['ai', ['ai', 'llm', 'gpt', 'chatgpt', 'claude', 'gemini', 'model', 'neural', 'machine learning', 'agent', 'transformer', 'anthropic', 'openai']],
    ['security', ['cve', 'vulnerability', 'exploit', 'ransomware', 'zero-day', 'security', 'breach', 'hack']],
    ['infrastructure', ['kubernetes', 'docker', 'aws', 'cloud', 'database', 'postgres', 'redis', 'serverless', 'terraform']],
    ['devops', ['ci/cd', 'deploy', 'pipeline', 'observability', 'monitoring', 'helm', 'gitops']],
    ['web', ['react', 'nextjs', 'vue', 'angular', 'typescript', 'javascript', 'frontend', 'css', 'browser']],
    ['software-engineering', ['rust', 'go ', 'refactor', 'codebase', 'compiler', 'framework', 'library', 'algorithm']],
    ['open-source', ['open source', 'github', 'license', 'oss ', 'foss', 'free software']],
    ['developer-tools', ['cli', 'editor', 'ide', 'debug', 'tooling', 'sdk', 'vscode', 'vim']],
    ['product', ['launch', 'product', 'ux', 'design', 'startup', 'saas', 'b2b']],
    ['data', ['database', 'sql', 'analytics', 'data', 'warehouse', 'etl', 'pipeline']],
  ]

  for (const [topic, keywords] of keywordTopics) {
    if (keywords.some(kw => lower.includes(kw))) topics.push(topic)
  }

  return topics.length > 0 ? [...new Set(topics)] : ['general']
}

export function redditProgrammingAdapter(): SourceAdapter {
  return {
    sourceType: 'reddit',
    sourceKey: 'reddit-programming',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const subreddits = ['programming', 'machinelearning', 'devops', 'rust', 'golang', 'webdev']
      const signals: RawTrendSignal[] = []

      for (const sub of subreddits.slice(0, 3)) {
        try {
          const res = await fetch(
            `${REDDIT_API}/r/${sub}/hot.json?limit=10`,
            {
              signal: AbortSignal.timeout(FETCH_TIMEOUT),
              headers: { 'User-Agent': 'Relay-Studio/1.0' },
            },
          )
          if (!res.ok) continue
          const json = (await res.json()) as { data: { children: RedditPost[] } }
          const posts = json.data?.children ?? []

          for (const post of posts.slice(0, 8)) {
            const p = post.data
            if (!p.title || p.score < 10) continue
            signals.push({
              source: 'reddit',
              sourceType: 'reddit' as const,
              sourceItemId: `reddit-${p.id}`,
              url: `https://reddit.com${p.permalink}`,
              title: p.title,
              excerpt: p.selftext?.slice(0, 200),
              author: p.author,
              publishedAt: new Date(p.created_utc * 1000).toISOString(),
              tags: inferRedditTopics(p.title, p.subreddit),
              metrics: {
                score: p.score,
                comments: p.num_comments,
                subreddit: p.subreddit,
              },
            })
          }
        } catch {
          // Subreddit failed — continue to next
        }
      }

      return signals
    },
  }
}

export function redditTechNewsAdapter(): SourceAdapter {
  return {
    sourceType: 'reddit',
    sourceKey: 'reddit-technews',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const subreddits = ['technology', 'Futurology', 'science']
      const signals: RawTrendSignal[] = []

      for (const sub of subreddits.slice(0, 2)) {
        try {
          const res = await fetch(
            `${REDDIT_API}/r/${sub}/top.json?limit=10&t=day`,
            {
              signal: AbortSignal.timeout(FETCH_TIMEOUT),
              headers: { 'User-Agent': 'Relay-Studio/1.0' },
            },
          )
          if (!res.ok) continue
          const json = (await res.json()) as { data: { children: RedditPost[] } }
          const posts = json.data?.children ?? []

          for (const post of posts.slice(0, 6)) {
            const p = post.data
            if (!p.title || p.score < 50) continue
            signals.push({
              source: 'reddit',
              sourceType: 'reddit' as const,
              sourceItemId: `reddit-${p.id}`,
              url: `https://reddit.com${p.permalink}`,
              title: p.title,
              excerpt: p.selftext?.slice(0, 200),
              author: p.author,
              publishedAt: new Date(p.created_utc * 1000).toISOString(),
              tags: inferRedditTopics(p.title, p.subreddit),
              metrics: {
                score: p.score,
                comments: p.num_comments,
                subreddit: p.subreddit,
              },
            })
          }
        } catch {
          // Continue
        }
      }

      return signals
    },
  }
}
