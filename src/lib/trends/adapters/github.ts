import type { SourceAdapter, RawTrendSignal, TrendStore } from '../types'

const GITHUB_API = 'https://api.github.com'
const FETCH_TIMEOUT = 10000

interface GitHubRepo {
  id: number
  full_name: string
  html_url: string
  description: string | null
  stargazers_count: number
  language: string | null
  updated_at: string
  created_at: string
  pushed_at: string
  topics: string[]
  owner: { login: string }
}

async function fetchGitHubRepos(query: string, sort: string): Promise<GitHubRepo[]> {
  const url = new URL(`${GITHUB_API}/search/repositories`)
  url.searchParams.set('q', query)
  url.searchParams.set('sort', sort)
  url.searchParams.set('order', 'desc')
  url.searchParams.set('per_page', '25')

  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    headers,
  })
  if (!res.ok) throw new Error(`GitHub API failed: ${res.status}`)
  const data = (await res.json()) as { items: GitHubRepo[] }
  return data.items ?? []
}

export function githubTrendingAdapter(): SourceAdapter {
  return {
    sourceType: 'github',
    sourceKey: 'github-trending',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const since = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      const repos = await fetchGitHubRepos(`created:>=${since}`, 'stars')
      return repos.map(repo => ({
        source: 'github',
        sourceType: 'github' as const,
        sourceItemId: String(repo.id),
        url: repo.html_url,
        title: `${repo.full_name}: ${repo.description ?? 'No description'}`,
        excerpt: repo.description ?? undefined,
        author: repo.owner.login,
        publishedAt: repo.created_at,
        tags: [repo.language?.toLowerCase() ?? 'unknown', ...repo.topics.slice(0, 3)],
        metrics: {
          stars: repo.stargazers_count,
          language: repo.language,
        },
      }))
    },
  }
}

export function githubRecentReleasesAdapter(): SourceAdapter {
  return {
    sourceType: 'github',
    sourceKey: 'github-recent',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      const repos = await fetchGitHubRepos('stars:>1000 pushed:>=2024-01-01', 'updated')
      return repos
        .filter(r => r.description)
        .slice(0, 20)
        .map(repo => ({
          source: 'github',
          sourceType: 'github' as const,
          sourceItemId: String(repo.id),
          url: repo.html_url,
          title: `${repo.full_name}: ${repo.description ?? ''}`,
          excerpt: repo.description ?? undefined,
          author: repo.owner.login,
          publishedAt: repo.pushed_at,
          tags: [repo.language?.toLowerCase() ?? 'unknown', ...repo.topics.slice(0, 3)],
          metrics: {
            stars: repo.stargazers_count,
            language: repo.language,
          },
        }))
    },
  }
}
