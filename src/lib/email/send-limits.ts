/**
 * Organization send limits.
 *
 * The limits live in `organizations.settings` JSONB — that is the column the send
 * path already enforces through `dailySendLimit` / `dailyConnectionSendLimit`.
 * This module is the one place that reads, validates and merges them, so the
 * admin route, the Settings UI and the enforcement cannot disagree about what a
 * limit is or what values are legal.
 */
import { dailyConnectionSendLimit, dailySendLimit } from '@/lib/ai/config'

export const SEND_LIMIT_KEYS = ['dailySendLimit', 'dailyConnectionLimit'] as const
export type SendLimitKey = (typeof SEND_LIMIT_KEYS)[number]

/**
 * Hard ceiling on any limit. A mailbox cannot safely send more than this in a
 * day regardless of what an admin types, so the UI and the enforcement share it.
 */
export const SEND_LIMIT_MAX = 200
export const SEND_LIMIT_MIN = 1

export interface SendLimits {
  dailySendLimit: number
  dailyConnectionLimit: number
}

export const SEND_LIMIT_LABELS: Record<SendLimitKey, string> = {
  dailySendLimit: 'DM & follow-up',
  dailyConnectionLimit: 'Connection & Upwork',
}

/** The limits in force for an organization, after org override and env fallback. */
export function readSendLimits(orgSettings?: Record<string, unknown> | null): SendLimits {
  return {
    dailySendLimit: dailySendLimit(orgSettings ?? {}),
    dailyConnectionLimit: dailyConnectionSendLimit(orgSettings ?? {}),
  }
}

export function isValidSendLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
}

/**
 * Validate a partial patch.
 *
 * Unknown keys are rejected rather than ignored: a typo in a client must not
 * silently leave the limit unchanged while the admin believes it was applied.
 */
export function validateSendLimitPatch(input: unknown): { ok: true; patch: Partial<SendLimits> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Body must be a JSON object.' }
  }

  const patch: Partial<SendLimits> = {}
  const record = input as Record<string, unknown>

  for (const key of Object.keys(record)) {
    if (!(SEND_LIMIT_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: `Unknown limit "${key}". Allowed: ${SEND_LIMIT_KEYS.join(', ')}.` }
    }
  }

  for (const key of SEND_LIMIT_KEYS) {
    const value = record[key]
    if (value === undefined) continue
    if (!isValidSendLimit(value)) {
      return { ok: false, error: `${key} must be a whole number.` }
    }
    if (value < SEND_LIMIT_MIN || value > SEND_LIMIT_MAX) {
      return { ok: false, error: `${key} must be between ${SEND_LIMIT_MIN} and ${SEND_LIMIT_MAX}.` }
    }
    patch[key] = value
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No limits supplied.' }
  }

  return { ok: true, patch }
}

/**
 * Merge a patch into the existing settings without disturbing other keys.
 *
 * Returns the full settings object to write back.
 */
export function mergeSendLimits(
  current: Record<string, unknown> | null | undefined,
  patch: Partial<SendLimits>,
): Record<string, unknown> {
  return { ...(current ?? {}), ...patch }
}

/** The step the admin UI moves by. Small enough to tune, large enough to reach a target. */
export const SEND_LIMIT_STEP = 5

export function nextSendLimit(current: number, direction: 'up' | 'down'): number {
  const next = direction === 'up' ? current + SEND_LIMIT_STEP : current - SEND_LIMIT_STEP
  return Math.min(SEND_LIMIT_MAX, Math.max(SEND_LIMIT_MIN, next))
}

// ---------------------------------------------------------------------------
// Email policy — autonomy and safety, from organization_email_policy
// ---------------------------------------------------------------------------

export interface EmailPolicyPatch {
  enabled?: boolean
  autonomyMode?: 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT'
  hourlySendCap?: number
  minimumSpacingSeconds?: number
  consecutiveFailureThreshold?: number
  bounceThreshold?: number
  weekendPolicy?: 'SKIP' | 'ALLOW'
  replyCooldownHours?: number
  minimumConfidence?: 'Possible' | 'Potential' | 'Unverified'
  requireVerifiedEmail?: boolean
  /** Per-mailbox daily ceiling, applied to every mailbox in the organization. */
  dailySendCap?: number
  workingHoursStart?: number
  workingHoursEnd?: number
  followUpLimit?: number
  /** Channel autonomy, stored on `organizations.settings` with the send limits. */
  linkedinAutonomyMode?: 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT'
  upworkAutonomyMode?: 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT'
}

const EMAIL_POLICY_KEYS: Array<keyof EmailPolicyPatch> = [
  'enabled',
  'autonomyMode',
  'hourlySendCap',
  'minimumSpacingSeconds',
  'consecutiveFailureThreshold',
  'bounceThreshold',
  'weekendPolicy',
  'replyCooldownHours',
  'minimumConfidence',
  'requireVerifiedEmail',
  'dailySendCap',
  'workingHoursStart',
  'workingHoursEnd',
  'followUpLimit',
  'linkedinAutonomyMode',
  'upworkAutonomyMode',
]

function optionalInt(value: unknown, field: string, min: number, max: number): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === undefined) return { ok: true }
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: `${field} must be a whole number.` }
  }
  if (value < min || value > max) return { ok: false, error: `${field} must be between ${min} and ${max}.` }
  return { ok: true, value }
}

export function validateEmailPolicyPatch(input: unknown): { ok: true; patch: EmailPolicyPatch } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Body must be a JSON object.' }
  }

  const record = input as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!(EMAIL_POLICY_KEYS as string[]).includes(key)) {
      return { ok: false, error: `Unknown field "${key}".` }
    }
  }

  const patch: EmailPolicyPatch = {}

  if (record.enabled !== undefined) {
    if (typeof record.enabled !== 'boolean') return { ok: false, error: 'enabled must be a boolean.' }
    patch.enabled = record.enabled
  }
  if (record.requireVerifiedEmail !== undefined) {
    if (typeof record.requireVerifiedEmail !== 'boolean') return { ok: false, error: 'requireVerifiedEmail must be a boolean.' }
    patch.requireVerifiedEmail = record.requireVerifiedEmail
  }
  if (record.autonomyMode !== undefined) {
    if (!['MANUAL', 'APPROVAL_REQUIRED', 'AUTOPILOT'].includes(record.autonomyMode as string)) {
      return { ok: false, error: 'autonomyMode must be MANUAL, APPROVAL_REQUIRED or AUTOPILOT.' }
    }
    patch.autonomyMode = record.autonomyMode as EmailPolicyPatch['autonomyMode']
  }
  if (record.weekendPolicy !== undefined) {
    if (!['SKIP', 'ALLOW'].includes(record.weekendPolicy as string)) {
      return { ok: false, error: 'weekendPolicy must be SKIP or ALLOW.' }
    }
    patch.weekendPolicy = record.weekendPolicy as EmailPolicyPatch['weekendPolicy']
  }
  if (record.minimumConfidence !== undefined) {
    if (!['Possible', 'Potential', 'Unverified'].includes(record.minimumConfidence as string)) {
      return { ok: false, error: 'minimumConfidence must be Possible, Potential or Unverified.' }
    }
    patch.minimumConfidence = record.minimumConfidence as EmailPolicyPatch['minimumConfidence']
  }
  for (const key of ['linkedinAutonomyMode', 'upworkAutonomyMode'] as const) {
    const value = record[key]
    if (value === undefined) continue
    if (!['MANUAL', 'APPROVAL_REQUIRED', 'AUTOPILOT'].includes(value as string)) {
      return { ok: false, error: `${key} must be MANUAL, APPROVAL_REQUIRED or AUTOPILOT.` }
    }
    patch[key] = value as EmailPolicyPatch[typeof key]
  }

  const intFields: Array<[keyof EmailPolicyPatch, unknown, number, number]> = [
    ['hourlySendCap', record.hourlySendCap, 0, 200],
    ['minimumSpacingSeconds', record.minimumSpacingSeconds, 0, 3600],
    ['consecutiveFailureThreshold', record.consecutiveFailureThreshold, 1, 10],
    ['bounceThreshold', record.bounceThreshold, 1, 100],
    ['replyCooldownHours', record.replyCooldownHours, 0, 720],
    ['dailySendCap', record.dailySendCap, 1, 200],
    ['followUpLimit', record.followUpLimit, 0, 10],
    ['workingHoursStart', record.workingHoursStart, 0, 23],
    ['workingHoursEnd', record.workingHoursEnd, 0, 23],
  ]

  for (const [key, value, min, max] of intFields) {
    if (value === undefined) continue
    const result = optionalInt(value, key, min, max)
    if (!result.ok) return result
    patch[key] = result.value as never
  }

  return { ok: true, patch }
}
