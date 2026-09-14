import type { UpworkJob } from '@/lib/domain/types'
import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJson } from '@/lib/ai/provider'

interface UpworkExtractionOutput {
  title: string
  description: string
  budget_min: number | null
  budget_max: number | null
  hourly_rate_min: number | null
  hourly_rate_max: number | null
  proposal_count: number | null
  required_skills: string[]
  urgency_signal: string | null
  tags: string[]
  posted_at: string | null
  remote_status: string | null
  client_name: string | null
}

const UPWORK_EXTRACT_SYSTEM = `You structure raw Upwork job posts into fields. You never score, never judge, never write anything persuasive. You only structure. Respond with a single JSON object.

Rules:
- title: the job title.
- description: a concise one-paragraph summary of what the client needs.
- budget_min / budget_max: fixed-price budget range in USD. Null if not stated or if hourly.
- hourly_rate_min / hourly_rate_max: hourly rate range in USD. Null if not stated or if fixed.
- proposal_count: number of existing proposals if shown. Null if not shown.
- required_skills: array of skill names the client lists. Lowercase.
- urgency_signal: exact text from the post suggesting urgency or a takeover (e.g. "previous developer left", "inherited codebase", "needs to be done ASAP"). Null if none.
- tags: 2 to 6 short lowercase stack and domain keywords. No invented tech.
- posted_at: the date/time the job was posted in ISO 8601 format (e.g. "2024-01-15T10:30:00Z"). Null if not shown. Use relative terms like "2 hours ago", "posted today", "yesterday" to derive the actual date where possible.
- remote_status: "remote", "hybrid", "onsite", or null if unclear. Only "remote" if explicitly stated.
- client_name: the client/company name if shown. Null if not shown.`

const UPWORK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'description',
    'budget_min',
    'budget_max',
    'hourly_rate_min',
    'hourly_rate_max',
    'proposal_count',
    'required_skills',
    'urgency_signal',
    'tags',
  ],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    budget_min: { type: ['integer', 'null'] },
    budget_max: { type: ['integer', 'null'] },
    hourly_rate_min: { type: ['integer', 'null'] },
    hourly_rate_max: { type: ['integer', 'null'] },
    proposal_count: { type: ['integer', 'null'] },
    required_skills: { type: 'array', items: { type: 'string' } },
    urgency_signal: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    posted_at: { type: ['string', 'null'] },
    remote_status: { type: ['string', 'null'] },
    client_name: { type: ['string', 'null'] },
  },
} as const

const empty = (v?: string | null): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

/**
 * Extract structured fields from a raw Upwork job post paste.
 */
export async function extractUpworkJob(rawText: string): Promise<
  Omit<UpworkJob, 'id' | 'ownerRepId' | 'score' | 'verdict' | 'status' | 'extractedFields' | 'createdAt' | 'clientEmail'>
> {
  if (!rawText.trim()) {
    throw new Error('Paste the job post first.')
  }

  if (!hasProvider()) {
    return demoExtract(rawText)
  }

  const { model } = pickModel('extract')
  const out = await structuredJson<UpworkExtractionOutput>({
    model,
    system: UPWORK_EXTRACT_SYSTEM,
    user: `Raw Upwork job post:\n\n${rawText}`,
    schema: UPWORK_SCHEMA,
  })

  return {
    title: empty(out.title) ?? 'Untitled job',
    organizationId: 'org-import',
    description: empty(out.description) ?? '',
    budgetMin: out.budget_min,
    budgetMax: out.budget_max,
    hourlyRateMin: out.hourly_rate_min,
    hourlyRateMax: out.hourly_rate_max,
    proposalCount: out.proposal_count,
    connectsCost: estimateConnects(out.proposal_count),
    requiredSkills: (out.required_skills ?? []).map((s) => s.toLowerCase().trim()),
    urgencySignal: empty(out.urgency_signal),
    rawInput: rawText,
    tags: (out.tags ?? []).slice(0, 6),
    postedAt: empty(out.posted_at) ?? null,
    remoteStatus: empty(out.remote_status) ?? null,
    clientName: empty(out.client_name) ?? null,
  }
}

function estimateConnects(proposalCount: number | null): number {
  if (proposalCount === null) return 6 // unknown = assume moderate
  if (proposalCount <= 5) return 2
  if (proposalCount <= 15) return 4
  return 8
}

function demoExtract(rawText: string): ReturnType<typeof extractUpworkJob> extends Promise<infer T> ? T : never {
  const titleMatch = rawText.match(/^(.{10,120})\n/)
  const budgetMatch = rawText.match(/\$([\d,]+)\s*(?:-\s*\$([\d,]+))?/)
  const hourlyMatch = rawText.match(/\$([\d]+)\s*-\s*\$([\d]+)\s*\/(?:hr|hour)/i)
  const proposalMatch = rawText.match(/(\d+)\s*proposals?/i)
  const skillsMatch = rawText.match(/Skills?:\s*([^\n]+)/i)

  const lower = rawText.toLowerCase()
  const urgency =
    lower.includes('previous developer left') || lower.includes('inherited codebase')
      ? 'previous developer left'
      : lower.includes('asap') || lower.includes('urgent')
        ? 'urgent timeline'
        : null

  const skills = skillsMatch
    ? skillsMatch[1].split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : []

  return {
    organizationId: 'org-import',
    title: titleMatch?.[1]?.trim() ?? 'Untitled job',
    description: rawText.slice(0, 400),
    budgetMin: budgetMatch && !hourlyMatch ? Number(budgetMatch[1].replace(/,/g, '')) : null,
    budgetMax: budgetMatch && !hourlyMatch && budgetMatch[2] ? Number(budgetMatch[2].replace(/,/g, '')) : null,
    hourlyRateMin: hourlyMatch ? Number(hourlyMatch[1]) : null,
    hourlyRateMax: hourlyMatch ? Number(hourlyMatch[2]) : null,
    proposalCount: proposalMatch ? Number(proposalMatch[1]) : null,
    connectsCost: estimateConnects(proposalMatch ? Number(proposalMatch[1]) : null),
    requiredSkills: skills,
    urgencySignal: urgency,
    rawInput: rawText,
    tags: demoTags(lower),
    postedAt: new Date().toISOString(),
    remoteStatus: 'remote',
    clientName: null,
  }
}

function demoTags(lower: string): string[] {
  const tags: string[] = []
  const pool = [
    ['react', 'react'],
    ['nextjs', 'nextjs'],
    ['python', 'python'],
    ['django', 'django'],
    ['rails', 'rails'],
    ['mobile', 'mobile'],
    ['ios', 'ios'],
    ['android', 'android'],
    ['api', 'api'],
    ['web', 'web'],
    ['design', 'design'],
    ['devops', 'devops'],
  ] as const
  for (const [word, tag] of pool) {
    if (lower.includes(word)) tags.push(tag)
    if (tags.length >= 4) break
  }
  return tags.length > 0 ? [...new Set(tags)] : ['web']
}
