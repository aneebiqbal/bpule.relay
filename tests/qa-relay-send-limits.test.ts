/**
 * SEND LIMITS — one authority, admin-controlled.
 *
 * The limits live in `organizations.settings` because that is the column the
 * send path enforces. These pin three things:
 *
 *   1. the resolved limit honours the org override over the env default
 *   2. the admin patch validation rejects anything it should not accept
 *   3. the Settings budget shows the same number the send path enforces
 *
 * (3) is the bug this fixes: `getTodayDashboard` used to call `dailySendLimit()`
 * with no org settings, so the UI showed the env default while enforcement used
 * the org override — a budget that could read "35 left" while the send path
 * allowed 30.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SEND_LIMIT_MAX,
  SEND_LIMIT_MIN,
  mergeSendLimits,
  nextSendLimit,
  readSendLimits,
  validateSendLimitPatch,
} from '@/lib/email/send-limits'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('send limits resolve the org override first', () => {
  it('honours the org override over the environment default', () => {
    const limits = readSendLimits({ dailySendLimit: 45, dailyConnectionLimit: 60 })
    expect(limits.dailySendLimit).toBe(45)
    expect(limits.dailyConnectionLimit).toBe(60)
  })

  it('caps an override at the hard ceiling', () => {
    expect(readSendLimits({ dailySendLimit: 9999 }).dailySendLimit).toBe(SEND_LIMIT_MAX)
  })

  it('falls back to the environment default when the override is absent', () => {
    expect(readSendLimits({}).dailySendLimit).toBeGreaterThan(0)
    expect(readSendLimits(null).dailyConnectionLimit).toBeGreaterThan(0)
  })

  it('ignores a non-numeric override rather than adopting it', () => {
    expect(readSendLimits({ dailySendLimit: 'lots' }).dailySendLimit).toBeGreaterThan(0)
    expect(readSendLimits({ dailySendLimit: 0 }).dailySendLimit).toBeGreaterThan(0)
  })
})

describe('send limit patch validation', () => {
  it('accepts a valid patch', () => {
    const result = validateSendLimitPatch({ dailySendLimit: 40 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.patch).toEqual({ dailySendLimit: 40 })
  })

  it('rejects an unknown key instead of silently ignoring it', () => {
    const result = validateSendLimitPatch({ dailySendLmit: 40 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Unknown limit')
  })

  it('rejects a non-integer', () => {
    expect(validateSendLimitPatch({ dailySendLimit: 12.5 }).ok).toBe(false)
    expect(validateSendLimitPatch({ dailySendLimit: '40' }).ok).toBe(false)
    expect(validateSendLimitPatch({ dailySendLimit: null }).ok).toBe(false)
  })

  it('rejects a value outside the allowed range', () => {
    expect(validateSendLimitPatch({ dailySendLimit: 0 }).ok).toBe(false)
    expect(validateSendLimitPatch({ dailySendLimit: SEND_LIMIT_MAX + 1 }).ok).toBe(false)
    expect(validateSendLimitPatch({ dailySendLimit: SEND_LIMIT_MIN }).ok).toBe(true)
  })

  it('rejects an empty patch', () => {
    expect(validateSendLimitPatch({}).ok).toBe(false)
    expect(validateSendLimitPatch(null).ok).toBe(false)
    expect(validateSendLimitPatch([1, 2]).ok).toBe(false)
  })
})

describe('merging preserves unrelated settings', () => {
  it('keeps keys the patch does not touch', () => {
    const merged = mergeSendLimits({ dailySendLimit: 30, someOtherKey: 'keep-me' }, { dailyConnectionLimit: 50 })
    expect(merged).toEqual({ dailySendLimit: 30, dailyConnectionLimit: 50, someOtherKey: 'keep-me' })
  })

  it('starts from empty settings without throwing', () => {
    expect(mergeSendLimits(null, { dailySendLimit: 20 })).toEqual({ dailySendLimit: 20 })
  })
})

describe('the step control stays inside the allowed range', () => {
  it('clamps at the ceiling and the floor', () => {
    expect(nextSendLimit(SEND_LIMIT_MAX, 'up')).toBe(SEND_LIMIT_MAX)
    expect(nextSendLimit(SEND_LIMIT_MIN, 'down')).toBe(SEND_LIMIT_MIN)
  })

  it('moves by a step in each direction', () => {
    expect(nextSendLimit(35, 'up')).toBeGreaterThan(35)
    expect(nextSendLimit(35, 'down')).toBeLessThan(35)
  })
})

describe('the budget the UI shows is the budget the send path enforces', () => {
  it('the Supabase store budget is the effective policy', () => {
    const store = read('src/lib/store/supabase-store.ts')
    expect(store).toContain('resolveSendPolicy')
    expect(store).toContain('getEffectivePolicy')
    expect(store).toContain('effective.budgets.dmFollowup.limit')
    expect(store).toContain('effective.budgets.connection.limit')
  })

  it('the demo store does the same, so it cannot drift', () => {
    const store = read('src/lib/store/mock-store.ts')
    expect(store).toContain('resolveSendPolicy')
    expect(store).toContain('getEffectivePolicy')
    // No direct limit call survives in the demo store either.
    expect(store).not.toMatch(/dailySendLimit\(\s*\)/)
    expect(store).not.toMatch(/dailyConnectionSendLimit\(\s*\)/)
  })

  it('the settings page renders the admin control for admins only', () => {
    const page = read('src/app/(app)/settings/page.tsx')
    expect(page).toContain('getEffectivePolicy')
    expect(page).toMatch(/isAdmin\s*&&\s*\(?\s*<[^>]*>\s*<SendLimits/)
  })

  it('the admin route refuses a non-admin', () => {
    const route = read('src/app/api/admin/send-limits/route.ts')
    expect(route).toContain('ctx.isAdmin')
    expect(route).toContain('403')
    expect(route).toContain('organizations')
  })

  it('the control is not rendered to a rep', () => {
    const page = read('src/app/(app)/settings/page.tsx')
    // The panel is inside the admin guard, so a rep never receives the control.
    const guard = page.indexOf('isAdmin && (')
    const panel = page.indexOf('<SendLimits')
    expect(guard).toBeGreaterThan(-1)
    expect(panel).toBeGreaterThan(guard)
  })
})
