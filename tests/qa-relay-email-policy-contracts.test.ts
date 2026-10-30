/**
 * The canonical email policy layer — autonomy, mailbox health and the single
 * eligibility gate.
 *
 * These are contract guards: they pin the decisions recorded in
 * docs/RELAY_PRODUCT_CONTRACTS.md (Contracts 14–16) so a future change cannot
 * silently reverse them.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTOPILOT_SAFE_REPLY_CLASSES,
  DEFAULT_EMAIL_AUTONOMY_MODE,
  isAutopilotSafeReplyClass,
  isEmailAutonomyMode,
  modeMayAutosend,
} from '@/lib/email/autonomy'
import { evaluateEmailSendEligibility, type EmailEligibilityInput } from '@/lib/email/eligibility'
import {
  MAILBOX_HEALTH_STATES,
  canSendFromHealth,
  deriveMailboxHealth,
  mailboxHealthBlocker,
  type MailboxHealthInput,
} from '@/lib/email/mailbox-health'
import {
  EmailProviderUnavailableError,
  getEmailProvider,
  registerEmailProvider,
  relayNoopEmailProvider,
} from '@/lib/email/providers/email-provider'
import type { EmailProvider } from '@/lib/email/providers/email-provider'

const HEALTHY_MAILBOX: MailboxHealthInput = {
  provider: 'gmail',
  status: 'CONNECTED',
  hasUsableToken: true,
  consecutiveFailures: 0,
  sentToday: 0,
  dailySendCap: 200,
  paused: false,
}

/** Every condition satisfied — the only input that may produce `eligible: true`. */
function eligibleInput(overrides: Partial<EmailEligibilityInput> = {}): EmailEligibilityInput {
  return {
    hasOpportunity: true,
    senderIdentityAuthorized: true,
    senderIdentityId: 'identity-1',
    mailboxHealth: 'CONNECTED',
    recipientEmail: 'buyer@acme.com',
    recipientContactVerified: true,
    notSuppressed: true,
    notOptedOut: true,
    notTerminal: true,
    notDuplicateContact: true,
    noUnansweredInboundReply: true,
    withinSendWindow: true,
    dailyQuotaAvailable: true,
    messageQualityPassed: true,
    claimsSafe: true,
    followUpAllowed: true,
    autonomyMode: 'APPROVAL_REQUIRED',
    now: new Date('2026-10-30T09:30:00Z'),
    ...overrides,
  }
}

describe('Contract 14 — one email delivery authority, mailbox belongs to a sender identity', () => {
  it('declares exactly five mailbox health states, and only CONNECTED may send', () => {
    expect([...MAILBOX_HEALTH_STATES]).toEqual([
      'CONNECTED',
      'REAUTH_REQUIRED',
      'DISCONNECTED',
      'DEGRADED',
      'PAUSED',
    ])
    for (const state of MAILBOX_HEALTH_STATES) {
      expect(canSendFromHealth(state)).toBe(state === 'CONNECTED')
    }
    expect(canSendFromHealth(null)).toBe(false)
  })

  it('the no-op provider is never a connected mailbox', () => {
    expect(deriveMailboxHealth({ ...HEALTHY_MAILBOX, provider: 'relay_noop' })).toBe('DISCONNECTED')
  })

  it('degrades on repeated failures or an exhausted daily cap', () => {
    expect(deriveMailboxHealth({ ...HEALTHY_MAILBOX, consecutiveFailures: 3 })).toBe('DEGRADED')
    expect(deriveMailboxHealth({ ...HEALTHY_MAILBOX, sentToday: 200 })).toBe('DEGRADED')
    expect(deriveMailboxHealth({ ...HEALTHY_MAILBOX, sentToday: 199 })).toBe('CONNECTED')
  })

  it('requires re-authentication when the stored status is connected but the token is unusable', () => {
    expect(deriveMailboxHealth({ ...HEALTHY_MAILBOX, hasUsableToken: false })).toBe('REAUTH_REQUIRED')
    expect(deriveMailboxHealth({ ...HEALTHY_MAILBOX, hasUsableToken: false, status: null })).toBe('DISCONNECTED')
  })

  it('pause wins over every other condition', () => {
    expect(deriveMailboxHealth({ ...HEALTHY_MAILBOX, paused: true, consecutiveFailures: 99 })).toBe('PAUSED')
  })

  it('reports a blocker for every non-sendable state and none for CONNECTED', () => {
    expect(mailboxHealthBlocker('CONNECTED')).toBeNull()
    for (const state of MAILBOX_HEALTH_STATES) {
      if (state === 'CONNECTED') continue
      expect(mailboxHealthBlocker(state)).toBeTruthy()
    }
  })
})

describe('Contract 15 — autonomy is a policy of the action', () => {
  it('defaults every existing organization to APPROVAL_REQUIRED', () => {
    expect(DEFAULT_EMAIL_AUTONOMY_MODE).toBe('APPROVAL_REQUIRED')
  })

  it('only AUTOPILOT may send without a human', () => {
    expect(modeMayAutosend('AUTOPILOT')).toBe(true)
    expect(modeMayAutosend('APPROVAL_REQUIRED')).toBe(false)
    expect(modeMayAutosend('MANUAL')).toBe(false)
    expect(modeMayAutosend(null)).toBe(false)
  })

  it('the autopilot-safe reply set is closed and excludes any obligation-creating class', () => {
    expect([...AUTOPILOT_SAFE_REPLY_CLASSES]).toEqual(['SCHEDULING', 'ACKNOWLEDGEMENT', 'FACTUAL_ANSWER'])
    for (const unsafe of ['PRICING', 'PROPOSAL_REQUEST', 'OBJECTION', 'NEGOTIATION', 'LEGAL']) {
      expect(isAutopilotSafeReplyClass(unsafe)).toBe(false)
    }
    expect(isAutopilotSafeReplyClass('SCHEDULING')).toBe(true)
  })

  it('rejects an unrecognised mode instead of defaulting to permissive', () => {
    expect(isEmailAutonomyMode('AUTOPILOT')).toBe(true)
    expect(isEmailAutonomyMode('autopilot')).toBe(false)
    expect(isEmailAutonomyMode('')).toBe(false)
    expect(isEmailAutonomyMode(null)).toBe(false)
  })

  it('a MANUAL organization produces PREPARE_ONLY and never a provider call', () => {
    const decision = evaluateEmailSendEligibility(eligibleInput({ autonomyMode: 'MANUAL' }))
    expect(decision.eligible).toBe(true)
    expect(decision.action).toBe('PREPARE_ONLY')
    expect(decision.requiresApproval).toBe(false)
  })
})

describe('Contract 16 — a send is blocked, not guessed', () => {
  it('an APPROVAL_REQUIRED send is eligible but requires a human', () => {
    const decision = evaluateEmailSendEligibility(eligibleInput({ autonomyMode: 'APPROVAL_REQUIRED' }))
    expect(decision.eligible).toBe(true)
    expect(decision.action).toBe('APPROVAL_REQUIRED')
    expect(decision.requiresApproval).toBe(true)
    expect(decision.sender).toBe('identity-1')
    expect(decision.recipient).toBe('buyer@acme.com')
    expect(decision.scheduledAt).toBe('2026-10-30T09:30:00.000Z')
  })

  it('an AUTOPILOT send that satisfies every condition may send directly', () => {
    const decision = evaluateEmailSendEligibility(eligibleInput({ autonomyMode: 'AUTOPILOT' }))
    expect(decision.action).toBe('SEND')
    expect(decision.requiresApproval).toBe(false)
  })

  it('collects every blocker rather than short-circuiting on the first', () => {
    const decision = evaluateEmailSendEligibility(
      eligibleInput({
        recipientEmail: null,
        recipientContactVerified: false,
        notSuppressed: false,
        withinSendWindow: false,
        mailboxHealth: 'DEGRADED',
      }),
    )
    expect(decision.eligible).toBe(false)
    expect(decision.action).toBe('BLOCK')
    expect(decision.requiresApproval).toBe(false)
    expect(decision.scheduledAt).toBeNull()
    expect(decision.blockers).toEqual(
      expect.arrayContaining([
        'recipient_email_missing',
        'suppressed',
        'outside_send_window',
        'mailbox_degraded',
      ]),
    )
  })

  it('a non-CONNECTED mailbox blocks even when every other condition passes', () => {
    for (const health of ['REAUTH_REQUIRED', 'DISCONNECTED', 'DEGRADED', 'PAUSED'] as const) {
      const decision = evaluateEmailSendEligibility(eligibleInput({ mailboxHealth: health }))
      expect(decision.eligible).toBe(false)
      expect(decision.blockers).toContain(`mailbox_${health.toLowerCase()}`)
    }
  })

  it('an unknown mailbox state blocks rather than assuming it is safe', () => {
    const decision = evaluateEmailSendEligibility(eligibleInput({ mailboxHealth: null }))
    expect(decision.eligible).toBe(false)
    expect(decision.blockers).toContain('mailbox_unknown')
  })

  it('an opted-out or terminal lead is blocked before any provider call', () => {
    expect(evaluateEmailSendEligibility(eligibleInput({ notOptedOut: false })).blockers).toContain('opted_out')
    expect(evaluateEmailSendEligibility(eligibleInput({ notTerminal: false })).blockers).toContain('terminal_state')
  })

  it('a suppressed address is the single authority — no surface bypasses it', () => {
    const decision = evaluateEmailSendEligibility(eligibleInput({ notSuppressed: false }))
    expect(decision.blockers).toEqual(['suppressed'])
  })

  it('an unanswered inbound reply blocks a cold follow-up', () => {
    const decision = evaluateEmailSendEligibility(eligibleInput({ noUnansweredInboundReply: false }))
    expect(decision.blockers).toContain('unanswered_inbound_reply')
  })
})

describe('the provider registry fails closed', () => {
  const original = process.env.RELAY_ALLOW_NOOP_EMAIL_PROVIDER

  afterEach(() => {
    if (original === undefined) delete process.env.RELAY_ALLOW_NOOP_EMAIL_PROVIDER
    else process.env.RELAY_ALLOW_NOOP_EMAIL_PROVIDER = original
  })

  it('refuses an unknown provider instead of silently falling back to the no-op', () => {
    expect(() => getEmailProvider('gmail')).toThrow(EmailProviderUnavailableError)
    expect(() => getEmailProvider(null)).toThrow('no_email_provider_configured')
    expect(() => getEmailProvider('  ')).toThrow('no_email_provider_configured')
  })

  it('refuses the no-op provider unless explicitly allowed', () => {
    delete process.env.RELAY_ALLOW_NOOP_EMAIL_PROVIDER
    expect(() => getEmailProvider('relay_noop')).toThrow('noop_email_provider_not_available')
  })

  it('resolves a registered provider by id', () => {
    const fake: EmailProvider = { ...relayNoopEmailProvider, id: 'gmail', name: 'Gmail' }
    registerEmailProvider(fake)
    expect(getEmailProvider('gmail')).toBe(fake)
  })

  it('allows the no-op provider when the test override is set', () => {
    process.env.RELAY_ALLOW_NOOP_EMAIL_PROVIDER = 'true'
    expect(getEmailProvider('relay_noop')).toBe(relayNoopEmailProvider)
  })
})
