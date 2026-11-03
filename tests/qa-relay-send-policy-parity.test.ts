/**
 * SEND POLICY_PARITY
 *
 * Contract: displayed send policy must equal enforced send policy.
 *
 * Every surface showing remaining sends, channel availability, autonomy state or
 * a send window derives from `resolveSendPolicy` — the same function the send
 * path calls immediately before it calls a provider.
 *
 * The bug this prevents: Settings showed the environment default while
 * `markContacted` enforced the organization override, because the UI called
 * `dailySendLimit()` with no org settings. Nothing was wrong with either limit
 * individually; the split was that no single object resolved them.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import {
  resolveSendPolicy,
  type EffectiveSendPolicy,
  type SendPolicyInput,
} from '@/lib/email/effective-policy'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const OPERATING: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

/** 15:00 in Karachi on Friday 2026-10-30 — inside the workday window. */
const INSIDE = new Date('2026-10-30T10:00:00Z')
/** 20:00 in Karachi — after the workday window. */
const AFTER = new Date('2026-10-30T15:00:00Z')

function input(overrides: Partial<SendPolicyInput> = {}): SendPolicyInput {
  return {
    organizationId: 'org-1',
    now: INSIDE,
    operating: OPERATING,
    orgSettings: { dailySendLimit: 35, dailyConnectionLimit: 20 },
    emailPolicy: {
      enabled: true,
      autonomy_mode: 'APPROVAL_REQUIRED',
      hourly_send_cap: 5,
      minimum_spacing_seconds: 240,
      consecutive_failure_threshold: 3,
      bounce_threshold: 5,
      weekend_policy: 'SKIP',
      require_verified_email: true,
    },
    mailboxPolicies: [
      {
        revenueIdentityId: 'identity-1',
        dailySendCap: 25,
        minimumDelaySeconds: 240,
        workingHoursStart: 9,
        workingHoursEnd: 17,
        followUpLimit: 2,
        sentToday: 12,
        lastSentAt: '2026-10-30T09:50:00Z',
      },
    ],
    usage: { dmFollowup: 10, connection: 4, upwork: 6 },
    ...overrides,
  }
}

describe('the effective policy resolves one object from every authority', () => {
  it('resolves the org override over the environment default', () => {
    const policy = resolveSendPolicy(input())
    expect(policy.budgets.dmFollowup.limit).toBe(35)
    expect(policy.budgets.connection.limit).toBe(20)
  })

  it('remaining is limit minus used, and exhaustion is explicit', () => {
    const policy = resolveSendPolicy(input())
    expect(policy.budgets.dmFollowup).toMatchObject({ limit: 35, used: 10, remaining: 25, exhausted: false })

    const spent = resolveSendPolicy(input({ usage: { dmFollowup: 40, connection: 0, upwork: 0 } }))
    expect(spent.budgets.dmFollowup.remaining).toBe(0)
    expect(spent.budgets.dmFollowup.exhausted).toBe(true)
  })

  it('is deterministic — the same input yields the same object', () => {
    expect(resolveSendPolicy(input())).toEqual(resolveSendPolicy(input()))
  })

  it('derives the window and business date from the operating policy only', () => {
    const inside = resolveSendPolicy(input())
    const after = resolveSendPolicy(input({ now: AFTER }))

    expect(inside.timezone).toBe('Asia/Karachi')
    expect(inside.businessDate).toBe('2026-10-30')
    expect(inside.withinSendWindow).toBe(true)
    expect(after.withinSendWindow).toBe(false)
  })

  it('never slices a business date from raw UTC', () => {
    // 23:30 UTC on 2026-10-30 is 04:30 on 2026-10-31 in Karachi.
    const late = resolveSendPolicy(input({ now: new Date('2026-10-30T23:30:00Z') }))
    expect(late.businessDate).toBe('2026-10-31')
  })

  it('resolves autonomy per channel from its own authority', () => {
    const policy = resolveSendPolicy(
      input({ orgSettings: { dailySendLimit: 1, dailyConnectionLimit: 1, linkedinAutonomyMode: 'MANUAL', upworkAutonomyMode: 'AUTOPILOT' } }),
    )
    expect(policy.autonomy).toEqual({ email: 'APPROVAL_REQUIRED', linkedin: 'MANUAL', upwork: 'AUTOPILOT' })
  })

  it('falls back to approval-required when a mode is absent or invalid', () => {
    const policy = resolveSendPolicy(input({ emailPolicy: { autonomy_mode: 'YESTERDAY' } }))
    expect(policy.autonomy.email).toBe('APPROVAL_REQUIRED')
  })

  it('resolves per-mailbox email state from the mailbox policy', () => {
    const policy = resolveSendPolicy(input())
    expect(policy.mailboxes[0]).toMatchObject({
      revenueIdentityId: 'identity-1',
      dailyLimit: 25,
      sentToday: 12,
      remaining: 13,
    })
    expect(policy.email.dailyPerMailbox).toBe(25)
    expect(policy.email.maxFollowups).toBe(2)
    expect(policy.email.hourly).toBe(5)
    expect(policy.email.minimumSpacingMinutes).toBe(4)
  })

  it('computes the next send time from the spacing rule', () => {
    // Last sent 09:50, spacing 4 minutes, now 10:00 UTC == 15:00 Karachi.
    const policy = resolveSendPolicy(input())
    expect(policy.mailboxes[0].nextSendAvailableAt).toBeNull()
  })

  it('reports a delay when the spacing window has not elapsed', () => {
    const policy = resolveSendPolicy(
      input({
        mailboxPolicies: [
          {
            revenueIdentityId: 'identity-1',
            dailySendCap: 25,
            minimumDelaySeconds: 600,
            workingHoursStart: null,
            workingHoursEnd: null,
            followUpLimit: null,
            sentToday: 0,
            lastSentAt: '2026-10-30T09:58:00Z',
          },
        ],
      }),
    )
    expect(policy.mailboxes[0].nextSendAvailableAt).toBe('2026-10-30T10:08:00.000Z')
  })

  it('treats an absent email policy as enabled with safe defaults', () => {
    const policy = resolveSendPolicy(input({ emailPolicy: null }))
    expect(policy.email.enabled).toBe(true)
    expect(policy.autonomy.email).toBe('APPROVAL_REQUIRED')
  })
})

describe('PARITY — displayed policy is the enforced policy', () => {
  it('the store budget is the effective policy, not a second calculation', () => {
    const store = read('src/lib/store/supabase-store.ts')
    expect(store).toContain('resolveSendPolicy')
    expect(store).toContain('effective.budgets.dmFollowup.limit')
    expect(store).toContain('effective.budgets.connection.limit')
  })

  it('the send path reads the resolver rather than a raw limit', () => {
    const decision = read('src/lib/email/send-decision.ts')
    expect(decision).toContain('resolveSendPolicy')
    expect(decision).toContain('mailboxBudget')
    // The quota check must come from the resolved object.
    expect(decision).toContain('dailyQuotaAvailable: mailboxBudget')
  })

  it('the per-mailbox quota comes from email_sending_policies, not a column that does not exist', () => {
    const decision = read('src/lib/email/send-decision.ts')
    expect(decision).toContain('email_sending_policies')
    expect(decision).not.toContain('emailPolicy?.daily_send_cap')
  })

  it('the settings surface reads the same resolver', () => {
    const page = read('src/app/(app)/settings/page.tsx')
    expect(page).toContain('getEffectivePolicy')
  })

  it('no surface computes a display limit outside the resolver or the config module', () => {
    // The only legitimate direct callers of the raw limit functions are the
    // resolver itself and the config module that defines them.
    const offenders: string[] = []
    const files = [
      'src/lib/store/supabase-store.ts',
      'src/lib/store/mock-store.ts',
      'src/lib/email/effective-policy.ts',
      'src/lib/email/send-decision.ts',
    ]
    for (const file of files) {
      const source = read(file)
      if (file.endsWith('effective-policy.ts')) continue
      const calls = source.match(/dailySendLimit\(|dailyConnectionSendLimit\(/g) ?? []
      // The store is allowed exactly the two resolver-supplied usages; any other
      // direct call would be a surface computing its own number.
      const allowed = file.includes('supabase-store.ts') ? 0 : 0
      if (calls.length > allowed) offenders.push(`${file}: ${calls.length}`)
    }
    expect(offenders).toEqual([])
  })
})
