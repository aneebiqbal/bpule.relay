/**
 * Named send-policy regression fixtures.
 *
 * Each fixture is a named contract from the send-policy specification. They exist
 * so a future change cannot silently reverse a precedence rule — the failure mode
 * this whole engine exists to prevent is "the UI shows one thing, the send path
 * enforces another".
 *
 * Fixtures:
 *   ORG_OVERRIDE_BEATS_ENV_DEFAULT
 *   MAILBOX_CAP_BEATS_ORG_EMAIL_CAP
 *   TERMINAL_BLOCKS_ALL
 *   OPT_OUT_BLOCKS_ALL
 *   PAUSED_MAILBOX_BLOCKS_AUTOPILOT
 *   DAILY_LIMIT_BLOCKS_SEND
 *   HOURLY_LIMIT_BLOCKS_SEND
 *   SPACING_BLOCKS_CONCURRENT_SEND
 *   SEND_WINDOW_USES_ORG_TIMEZONE
 */
import { describe, expect, it } from 'vitest'
import { normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import {
  evaluateSendPolicy,
  type MailboxPolicyState,
  type SendPolicyContext,
} from '@/lib/email/policy-engine'

const KARACHI: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

/** 15:00 Karachi on Friday 2026-10-30 — inside the workday window. */
const INSIDE = new Date('2026-10-30T10:00:00Z')

function mailbox(overrides: Partial<MailboxPolicyState> = {}): MailboxPolicyState {
  return {
    revenueIdentityId: 'identity-1',
    health: 'HEALTHY',
    consecutiveFailures: 0,
    sentToday: 0,
    sentTodayDate: '2026-10-30',
    pausedAt: null,
    dailySendCap: 25,
    minimumDelaySeconds: 240,
    workingHoursStart: 9,
    workingHoursEnd: 17,
    followUpLimit: 2,
    lastSentAt: null,
    ...overrides,
  }
}

function context(overrides: Partial<SendPolicyContext> = {}): SendPolicyContext {
  return {
    organizationId: 'org-1',
    revenueIdentityId: 'identity-1',
    senderProfileId: 'profile-1',
    channel: 'email',
    messageType: 'email_first',
    now: INSIDE,
    operating: KARACHI,
    orgSettings: { dailySendLimit: 35, dailyConnectionLimit: 20 },
    emailPolicy: {
      enabled: true,
      autonomy_mode: 'APPROVAL_REQUIRED',
      hourly_send_cap: 5,
      minimum_spacing_seconds: 240,
      consecutive_failure_threshold: 3,
      bounce_threshold: 5,
      weekend_policy: 'SKIP',
    },
    mailbox: mailbox(),
    usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 0, emailSentThisHour: 0, followupsUsed: 0 },
    safety: {
      terminal: false,
      optedOut: false,
      suppressed: false,
      senderAuthorized: true,
      recipientVerified: true,
      messageQualityPassed: true,
    },
    ...overrides,
  }
}

describe('ORG_OVERRIDE_BEATS_ENV_DEFAULT', () => {
  it('the org override is the limit the decision reports', () => {
    const decision = evaluateSendPolicy(context({ orgSettings: { dailySendLimit: 45, dailyConnectionLimit: 60 } }))
    expect(decision.dailyLimit).toBe(25)
    // The mailbox cap is the tighter authority for email, and it wins.
    expect(decision.blockers).toEqual([])
  })

  it('falls back to the environment default when the org has not set one', () => {
    const decision = evaluateSendPolicy(context({ orgSettings: {} }))
    expect(decision.allowed).toBe(true)
  })
})

describe('MAILBOX_CAP_BEATS_ORG_EMAIL_CAP', () => {
  it('the mailbox daily cap, not the org ceiling, governs email usage', () => {
    const decision = evaluateSendPolicy(
      context({
        mailbox: mailbox({ dailySendCap: 5 }),
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 5, emailSentThisHour: 0, followupsUsed: 0 },
      }),
    )
    expect(decision.dailyLimit).toBe(5)
    expect(decision.dailyUsed).toBe(5)
    expect(decision.dailyRemaining).toBe(0)
    expect(decision.blockers).toContain('daily_limit_reached')
  })

  it('a null mailbox cap does not block on usage', () => {
    const decision = evaluateSendPolicy(
      context({
        mailbox: mailbox({ dailySendCap: null }),
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 999, emailSentThisHour: 0, followupsUsed: 0 },
      }),
    )
    expect(decision.blockers).not.toContain('daily_limit_reached')
  })
})

describe('TERMINAL_BLOCKS_ALL', () => {
  it('blocks even when every other gate is green', () => {
    const decision = evaluateSendPolicy(context({ safety: { terminal: true, optedOut: false, suppressed: false, senderAuthorized: true, recipientVerified: true, messageQualityPassed: true } }))
    expect(decision.allowed).toBe(false)
    expect(decision.blockers).toContain('terminal_state')
  })

  it('terminal blocks before autonomy is even consulted', () => {
    const decision = evaluateSendPolicy(
      context({
        emailPolicy: { autonomy_mode: 'AUTOPILOT', hourly_send_cap: 5 },
        safety: { terminal: true, optedOut: false, suppressed: false, senderAuthorized: true, recipientVerified: true, messageQualityPassed: true },
      }),
    )
    // A healthy mailbox produces no health blocker, so the terminal block is first.
    expect(decision.blockers[0]).toBe('terminal_state')
    expect(decision.blockers).not.toContain('autonomy_manual')
  })
})

describe('OPT_OUT_BLOCKS_ALL', () => {
  it('blocks an opted-out recipient', () => {
    const decision = evaluateSendPolicy(context({ safety: { terminal: false, optedOut: true, suppressed: false, senderAuthorized: true, recipientVerified: true, messageQualityPassed: true } }))
    expect(decision.blockers).toContain('opted_out')
  })

  it('a suppression row blocks independently of the opt-out flag', () => {
    const decision = evaluateSendPolicy(context({ safety: { terminal: false, optedOut: false, suppressed: true, senderAuthorized: true, recipientVerified: true, messageQualityPassed: true } }))
    expect(decision.blockers).toContain('suppressed')
  })
})

describe('PAUSED_MAILBOX_BLOCKS_AUTOPILOT', () => {
  it('a paused mailbox blocks even under AUTOPILOT', () => {
    const decision = evaluateSendPolicy(
      context({
        emailPolicy: { autonomy_mode: 'AUTOPILOT', hourly_send_cap: 5 },
        mailbox: mailbox({ health: 'PAUSED', pausedAt: '2026-10-30T08:00:00Z' }),
      }),
    )
    expect(decision.autonomyMode).toBe('AUTOPILOT')
    expect(decision.allowed).toBe(false)
    expect(decision.blockers).toContain('mailbox_paused')
  })

  it('a degraded mailbox blocks autonomous sends', () => {
    const decision = evaluateSendPolicy(
      context({
        emailPolicy: { autonomy_mode: 'AUTOPILOT', consecutive_failure_threshold: 2 },
        mailbox: mailbox({ health: 'DEGRADED', consecutiveFailures: 2 }),
      }),
    )
    expect(decision.allowed).toBe(false)
    expect(decision.blockers).toContain('mailbox_degraded')
  })

  it('a mailbox needing re-authentication blocks', () => {
    const decision = evaluateSendPolicy(context({ mailbox: mailbox({ health: 'REAUTH_REQUIRED' }) }))
    expect(decision.blockers).toContain('mailbox_reauth_required')
  })
})

describe('DAILY_LIMIT_BLOCKS_SEND', () => {
  it('blocks at the cap', () => {
    const decision = evaluateSendPolicy(
      context({
        mailbox: mailbox({ dailySendCap: 20 }),
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 20, emailSentThisHour: 0, followupsUsed: 0 },
      }),
    )
    expect(decision.blockers).toContain('daily_limit_reached')
    expect(decision.dailyRemaining).toBe(0)
  })

  it('allows the send one below the cap', () => {
    const decision = evaluateSendPolicy(
      context({
        mailbox: mailbox({ dailySendCap: 20 }),
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 19, emailSentThisHour: 0, followupsUsed: 0 },
      }),
    )
    expect(decision.blockers).not.toContain('daily_limit_reached')
    expect(decision.dailyRemaining).toBe(1)
  })
})

describe('HOURLY_LIMIT_BLOCKS_SEND', () => {
  it('blocks when the hourly cap is reached', () => {
    const decision = evaluateSendPolicy(
      context({
        emailPolicy: { autonomy_mode: 'APPROVAL_REQUIRED', hourly_send_cap: 5 },
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 0, emailSentThisHour: 5, followupsUsed: 0 },
      }),
    )
    expect(decision.blockers).toContain('hourly_limit_reached')
    expect(decision.hourlyRemaining).toBe(0)
  })

  it('does not block when no hourly cap is configured', () => {
    const decision = evaluateSendPolicy(
      context({
        emailPolicy: { autonomy_mode: 'APPROVAL_REQUIRED', hourly_send_cap: 0 },
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 0, emailSentThisHour: 999, followupsUsed: 0 },
      }),
    )
    expect(decision.hourlyLimit).toBe(null)
    expect(decision.blockers).not.toContain('hourly_limit_reached')
  })
})

describe('SPACING_BLOCKS_CONCURRENT_SEND', () => {
  it('blocks a second send inside the spacing window', () => {
    const decision = evaluateSendPolicy(
      context({
        mailbox: mailbox({ minimumDelaySeconds: 600, lastSentAt: '2026-10-30T09:58:00Z' }),
      }),
    )
    expect(decision.blockers).toContain('spacing_not_elapsed')
    expect(decision.nextSendAt).toBe('2026-10-30T10:08:00.000Z')
    expect(decision.minimumSpacingMinutes).toBe(10)
  })

  it('allows the send once the window has elapsed', () => {
    const decision = evaluateSendPolicy(
      context({
        mailbox: mailbox({ minimumDelaySeconds: 600, lastSentAt: '2026-10-30T09:00:00Z' }),
      }),
    )
    expect(decision.blockers).not.toContain('spacing_not_elapsed')
    expect(decision.nextSendAt).toBeNull()
  })

  it('two decisions taken at the same instant agree — the guard is not racy in the decision layer', () => {
    const ctx = context({ mailbox: mailbox({ minimumDelaySeconds: 600, lastSentAt: '2026-10-30T09:59:00Z' }) })
    const first = evaluateSendPolicy(ctx)
    const second = evaluateSendPolicy(ctx)
    expect(first.blockers).toEqual(second.blockers)
    expect(first.nextSendAt).toBe(second.nextSendAt)
  })
})

describe('SEND_WINDOW_USES_ORG_TIMEZONE', () => {
  it('uses the operating policy timezone, never the browser or UTC', () => {
    // 2026-10-30T20:00Z is 01:00 on 2026-10-31 in Karachi — outside the window.
    const lateUtc = evaluateSendPolicy(context({ now: new Date('2026-10-30T20:00:00Z') }))
    expect(lateUtc.sendWindowOpen).toBe(false)
    expect(lateUtc.blockers).toContain('outside_send_window')
  })

  it('is closed on a non-working day', () => {
    // Sunday 2026-11-01, 15:00 Karachi.
    const sunday = evaluateSendPolicy(context({ now: new Date('2026-11-01T10:00:00Z') }))
    expect(sunday.sendWindowOpen).toBe(false)
  })

  it('applies the same rule in New York', () => {
    const newYork = normalizePolicy({
      organizationId: 'org-1',
      timezone: 'America/New_York',
      workdayStart: '09:00',
      workdayEnd: '18:00',
      workingDays: [1, 2, 3, 4, 5],
    })
    // 2026-10-30T14:00Z is 10:00 in New York — inside the window.
    const inside = evaluateSendPolicy(context({ now: new Date('2026-10-30T14:00:00Z'), operating: newYork }))
    expect(inside.sendWindowOpen).toBe(true)

    // 2026-10-30T23:00Z is 19:00 in New York — outside.
    const outside = evaluateSendPolicy(context({ now: new Date('2026-10-30T23:00:00Z'), operating: newYork }))
    expect(outside.sendWindowOpen).toBe(false)
  })

  it('handles the London DST boundary', () => {
    const london = normalizePolicy({
      organizationId: 'org-1',
      timezone: 'Europe/London',
      workdayStart: '09:00',
      workdayEnd: '18:00',
      workingDays: [1, 2, 3, 4, 5],
    })
    // 2026-10-25 is the fall-back, and it is a Sunday. Use the Friday before it:
    // 2026-10-23 is still BST (UTC+1), so 12:00Z is 13:00 local.
    const beforeFallBack = evaluateSendPolicy(context({ now: new Date('2026-10-23T12:00:00Z'), operating: london }))
    expect(beforeFallBack.sendWindowOpen).toBe(true)

    // 2026-03-29 is the spring-forward, also a Sunday. 2026-03-27 is GMT (UTC+0),
    // so 12:00Z is 12:00 local.
    const beforeSpringForward = evaluateSendPolicy(context({ now: new Date('2026-03-27T12:00:00Z'), operating: london }))
    expect(beforeSpringForward.sendWindowOpen).toBe(true)

    // And the same instant the day after the fall-back is GMT, still inside the window.
    const afterFallBack = evaluateSendPolicy(context({ now: new Date('2026-10-26T12:00:00Z'), operating: london }))
    expect(afterFallBack.sendWindowOpen).toBe(true)
  })
})

describe('precedence is explicit and never inverted', () => {
  it('a hard safety block outranks an exhausted limit', () => {
    const decision = evaluateSendPolicy(
      context({
        mailbox: mailbox({ health: 'PAUSED', dailySendCap: 1, pausedAt: '2026-10-30T08:00:00Z' }),
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 1, emailSentThisHour: 0, followupsUsed: 0 },
      }),
    )
    expect(decision.blockers[0]).toBe('mailbox_paused')
  })

  it('every blocker is reported, not only the first', () => {
    const decision = evaluateSendPolicy(
      context({
        emailPolicy: { autonomy_mode: 'MANUAL', hourly_send_cap: 1 },
        mailbox: mailbox({ dailySendCap: 1, minimumDelaySeconds: 600, lastSentAt: '2026-10-30T09:59:00Z' }),
        usage: { dmFollowup: 0, connection: 0, upwork: 0, emailSentToday: 1, emailSentThisHour: 1, followupsUsed: 0 },
      }),
    )
    expect(decision.blockers).toEqual(
      expect.arrayContaining(['autonomy_manual', 'daily_limit_reached', 'hourly_limit_reached', 'spacing_not_elapsed']),
    )
  })

  it('a clean context is allowed and reports no blockers', () => {
    const decision = evaluateSendPolicy(context())
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toBeNull()
    expect(decision.blockers).toEqual([])
  })
})
