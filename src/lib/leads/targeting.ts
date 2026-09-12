import type { MarketRegion, RoleCategory } from '@/lib/domain/types'
import { pickModel } from '@/lib/ai/routing'
import { structuredJson } from '@/lib/ai/provider'

const roleCache = new Map<string, RoleCategory>()

function enableRoleFallbackModel(): boolean {
  return process.env.SCOUT_ROLE_FALLBACK_MODEL === '1'
}

const ROLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['role_category'],
  properties: {
    role_category: {
      type: 'string',
      enum: [
        'founder_cofounder',
        'ceo',
        'technical_leadership',
        'product',
        'hiring_manager_recruiter',
        'other',
      ],
    },
  },
} as const

const CORE_REGIONS: Record<Exclude<MarketRegion, 'outside_core' | 'unknown'>, readonly string[]> = {
  US: ['united states', 'usa', 'u.s.', 'california', 'new york', 'texas', 'florida', 'washington'],
  UK: ['united kingdom', 'uk', 'england', 'scotland', 'wales', 'london', 'manchester'],
  EU: ['germany', 'france', 'spain', 'italy', 'netherlands', 'belgium', 'sweden', 'denmark', 'europe'],
  CA: ['canada', 'toronto', 'vancouver', 'montreal', 'ontario', 'british columbia'],
  AU: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth'],
  UAE: ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'sharjah'],
  SG: ['singapore', 'sg'],
}

const OUTSIDE_MARKERS = [
  'pakistan', 'india', 'bangladesh', 'nepal', 'sri lanka', 'nigeria', 'kenya', 'philippines',
  'indonesia', 'vietnam', 'brazil', 'argentina', 'mexico', 'egypt', 'saudi arabia',
]

function norm(v: string): string {
  return v.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function classifyRoleFromTitle(titleRaw: string | null | undefined): RoleCategory {
  const title = norm(titleRaw ?? '')
  if (!title) return 'other'

  if (/\b(co[- ]?founder|founder)\b/.test(title)) return 'founder_cofounder'
  if (/\bchief executive officer\b|\bceo\b/.test(title)) return 'ceo'
  if (/\bcto\b|chief technology officer|vp engineering|vice president engineering|head of engineering|engineering director/.test(title)) {
    return 'technical_leadership'
  }
  if (/\bproduct manager\b|\bproduct owner\b|head of product|vp product|director of product/.test(title)) {
    return 'product'
  }
  if (/\brecruiter\b|talent|hiring manager|people ops|human resources|\bhr\b|staffing/.test(title)) {
    return 'hiring_manager_recruiter'
  }
  return 'other'
}

export async function classifyRoleWithFallback(titleRaw: string | null | undefined): Promise<RoleCategory> {
  const title = norm(titleRaw ?? '')
  if (!title) return 'other'

  const direct = classifyRoleFromTitle(title)
  if (direct !== 'other') return direct

  if (!enableRoleFallbackModel()) return 'other'

  if (roleCache.has(title)) return roleCache.get(title) as RoleCategory

  const { model } = pickModel('classify')
  const out = await structuredJson<{ role_category: RoleCategory }>({
    model,
    system:
      'Classify this job title into exactly one role category. Return JSON only. Categories: founder_cofounder, ceo, technical_leadership, product, hiring_manager_recruiter, other.',
    user: `Title: ${titleRaw ?? ''}`,
    schema: ROLE_SCHEMA,
  })

  const role = out.role_category ?? 'other'
  roleCache.set(title, role)
  return role
}

export function mapLocationToRegion(locationRaw: string | null | undefined): MarketRegion {
  const location = norm(locationRaw ?? '')
  if (!location) return 'unknown'

  for (const [region, markers] of Object.entries(CORE_REGIONS)) {
    if (markers.some((m) => location.includes(m))) return region as MarketRegion
  }

  if (OUTSIDE_MARKERS.some((m) => location.includes(m))) return 'outside_core'
  return 'unknown'
}

export function rolePromptGuidance(role: RoleCategory): string {
  switch (role) {
    case 'founder_cofounder':
    case 'ceo':
      return 'Role cue: this contact owns product and business outcomes. Frame the message around delivery risk to roadmap and revenue.'
    case 'technical_leadership':
      return 'Role cue: this contact can evaluate technical detail. Be concrete about inherited code, release gaps, and architecture risk.'
    case 'product':
      return 'Role cue: this contact owns roadmap commitments. Frame around blocked releases, delivery predictability, and stakeholder pressure.'
    case 'hiring_manager_recruiter':
      return 'Role cue: this contact may not own the technical buying decision. Ask who owns engineering delivery decisions instead of assuming authority.'
    default:
      return 'Role cue: use the default play framing.'
  }
}
