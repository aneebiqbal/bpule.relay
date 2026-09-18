export { classifyRoleFromTitle, mapLocationToRegion, rolePromptGuidance } from './targeting-pure'

import type { RoleCategory } from '@/lib/domain/types'

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

async function norm(v: string): Promise<string> {
  return v.toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function classifyRoleWithFallback(titleRaw: string | null | undefined): Promise<RoleCategory> {
  const title = await norm(titleRaw ?? '')
  if (!title) return 'other'

  const { classifyRoleFromTitle } = await import('./targeting-pure')
  const direct = classifyRoleFromTitle(title)
  if (direct !== 'other') return direct

  if (!enableRoleFallbackModel()) return 'other'

  if (roleCache.has(title)) return roleCache.get(title) as RoleCategory

  const { generate } = await import('@/lib/ai/runtime')
  const result = await generate<{ role_category: RoleCategory }>({
    task: 'FAST_STRUCTURED',
    system:
      'Classify this job title into exactly one role category. Return JSON only. Categories: founder_cofounder, ceo, technical_leadership, product, hiring_manager_recruiter, other.',
    user: `Title: ${titleRaw ?? ''}`,
    schema: ROLE_SCHEMA,
    maxTokens: 128,
  })

  const role = result.data.role_category ?? 'other'
  roleCache.set(title, role)
  return role
}
