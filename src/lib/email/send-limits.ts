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
