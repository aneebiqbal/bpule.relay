import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJson } from '@/lib/ai/provider'

const TAGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tags'],
  properties: {
    tags: { type: 'array', items: { type: 'string' }, maxItems: 8 },
  },
} as const

const TAGS_SYSTEM = `You tag a past engineering project for later retrieval. Return 3 to 8 short lowercase keywords covering the stack and the domain (for example "react", "rails", "compliance", "fintech", "integration"). Only keywords the description actually supports. No invented tech, no client names.`

/**
 * One cheap classification call that tags a proof item. The result is cached
 * forever on the row; it never runs at draft time.
 */
export async function classifyProofTags(text: string): Promise<string[]> {
  if (!hasProvider()) return demoTags(text)
  const { model } = pickModel('classify')
  const out = await structuredJson<{ tags: string[] }>({
    model,
    system: TAGS_SYSTEM,
    user: `Project description:\n\n${text}\n\nReturn the tags as JSON.`,
    schema: TAGS_SCHEMA,
  })
  const tags = (out.tags ?? [])
    .map((t) => (t ?? '').toLowerCase().trim())
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 8)
  if (tags.length === 0) return ['general']
  return [...new Set(tags)]
}

function demoTags(text: string): string[] {
  const lower = text.toLowerCase()
  const pool = [
    'react', 'nextjs', 'rails', 'python', 'node', 'mobile', 'api',
    'compliance', 'fintech', 'healthcare', 'marketplace', 'integration',
  ]
  const found = pool.filter((t) => lower.includes(t))
  return found.length > 0 ? found.slice(0, 6) : ['general']
}