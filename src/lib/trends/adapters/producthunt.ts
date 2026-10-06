import type { SourceAdapter, RawTrendSignal, TrendStore } from '../types'

const PH_API = 'https://api.producthunt.com/v2/api/graphql'
const FETCH_TIMEOUT = 10000

interface PhPost {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  votesCount: number
  commentsCount: number
  createdAt: string
  topics: { edges: { node: { name: string } }[] }
  thumbnail: { url: string } | null
}

function inferPhTopics(post: PhPost): string[] {
  const text = `${post.name} ${post.tagline} ${post.description}`.toLowerCase()
  const topics: string[] = []

  const patterns: [string, string[]][] = [
    ['ai', ['ai', 'llm', 'gpt', 'machine learning', 'neural', 'chatbot', 'agent', 'openai', 'anthropic', 'claude', 'gemini']],
    ['developer-tools', ['developer', 'devtool', 'cli', 'api', 'sdk', 'code', 'programming', 'framework']],
    ['productivity', ['productivity', 'automation', 'workflow', 'notion', 'slack', 'project management']],
    ['design', ['design', 'figma', 'ui', 'ux', 'prototype', 'graphic']],
    ['saas', ['saas', 'b2b', 'enterprise', 'crm', 'sales', 'marketing']],
    ['no-code', ['no-code', 'low-code', 'builder', 'without code']],
    ['open-source', ['open source', 'github', 'free', 'oss']],
    ['analytics', ['analytics', 'data', 'metrics', 'dashboard', 'reporting']],
    ['security', ['security', 'privacy', 'encryption', 'auth']],
    ['fintech', ['fintech', 'payment', 'crypto', 'banking', 'finance']],
  ]

  for (const [topic, keywords] of patterns) {
    if (keywords.some(kw => text.includes(kw))) topics.push(topic)
  }

  // Also use PH's own topics
  for (const edge of post.topics?.edges ?? []) {
    const t = edge.node.name.toLowerCase().replace(/\s+/g, '-')
    if (t) topics.push(t)
  }

  return topics.length > 0 ? [...new Set(topics)].slice(0, 5) : ['product-launches']
}

export function productHuntAdapter(): SourceAdapter {
  return {
    sourceType: 'producthunt',
    sourceKey: 'producthunt-today',
    async fetch(_store: TrendStore): Promise<RawTrendSignal[]> {
      if (!process.env.PRODUCT_HUNT_TOKEN) {
        return []  // Graceful skip if no token configured
      }

      const query = `{
        posts(order: VOTES, postedAfter: "${new Date(Date.now() - 24 * 86400000).toISOString()}") {
          edges {
            node {
              id
              name
              tagline
              description
              url
              votesCount
              commentsCount
              createdAt
              topics { edges { node { name } } }
              thumbnail { url }
            }
          }
        }
      }`

      const res = await fetch(PH_API, {
        method: 'POST',
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PRODUCT_HUNT_TOKEN}`,
        },
        body: JSON.stringify({ query }),
      })

      if (!res.ok) return []
      const json = (await res.json()) as { data: { posts: { edges: { node: PhPost }[] } } }
      const edges = json.data?.posts?.edges ?? []

      return edges.slice(0, 20).map(({ node: post }) => ({
        source: 'producthunt',
        sourceType: 'producthunt' as const,
        sourceItemId: `ph-${post.id}`,
        url: post.url,
        title: `${post.name}: ${post.tagline}`,
        excerpt: post.description?.slice(0, 200),
        publishedAt: post.createdAt,
        tags: inferPhTopics(post),
        metrics: {
          votes: post.votesCount,
          comments: post.commentsCount,
        },
      }))
    },
  }
}
