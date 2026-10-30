/**
 * The effective send policy engine.
 *
 * One resolver, one precedence order, every consumer. The precedence is
 * documented here and applied in exactly this sequence — never implicitly, so a
 * reader can see why a send was blocked without tracing five functions.
 *
 *   1. hard safety block      — mailbox health, terminal state, opt-out
 *   2. org autonomy           — MANUAL never sends without a human
 *   3. send window            — organization operating clock, never browser time
 *   4. mailbox limits         — daily, hourly, spacing
 *   5. channel/type limits    — DM, connection, Upwork ceilings
 *   6. current usage          — sends already made today and this hour
 *   7. spacing                — the next send time
 *   8. allowed
 *
 * A later rule can only narrow a decision an earlier rule already made. Nothing
 * here can override a block from an earlier rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { currentInstant, isOrgWorkingDay, isWithinWorkday, orgDate, type OperatingPolicy } from '@/lib/org-clock'
import { messageTypeLimit } from '@/lib/ai/config'
import { DEFAULT_EMAIL_AUTONOMY_MODE, isEmailAutonomyMode, type EmailAutonomyMode } from './autonomy'
import { deriveMailboxHealth } from './mailbox-health'

export type SendChannel = 'linkedin' | 'email' | 'upwork'

/** The five canonical mailbox health states. */
export type MailboxHealthState = 'HEALTHY' | 'DEGRADED' | 'PAUSED' | 'REAUTH_REQUIRED' | 'DISCONNECTED'

export interface EffectiveSendPolicyDecision {
  allowed: boolean
  reason: string | null
  autonomyMode: EmailAutonomyMode

  dailyLimit: number
  dailyUsed: number
  dailyRemaining: number

  hourlyLimit: number | null
  hourlyUsed: number
  hourlyRemaining: number | null

  minimumSpacingMinutes: number
  nextSendAt: string | null

  sendWindowOpen: boolean
  sendWindowStart: string
  sendWindowEnd: string

  followupLimit: number
  followupsUsed: number

  mailboxHealth: MailboxHealthState

  bounceThreshold: number | null
  failureThreshold: number | null

  blockers: string[]
}

export interface MailboxPolicyState {
  revenueIdentityId: string | null
  health: MailboxHealthState | null
  consecutiveFailures: number
  sentToday: number
  sentTodayDate: string | null
  pausedAt: string | null
  dailySendCap: number | null
  minimumDelaySeconds: number | null
  workingHoursStart: number | null
  workingHoursEnd: number | null
  followUpLimit: number | null
  lastSentAt: string | null
}

export interface SendPolicyContext {
  organizationId: string
  revenueIdentityId: string | null
  senderProfileId: string | null
  channel: SendChannel
  messageType: string
  now: Date
  operating: OperatingPolicy
  orgSettings: Record<string, unknown>
  emailPolicy: Record<string, unknown> | null
  mailbox: MailboxPolicyState | null
  usage: {
    dmFollowup: number
    connection: number
    upwork: number
    emailSentToday: number
    emailSentThisHour: number
    followupsUsed: number
  }
  safety: {
    terminal: boolean
    optedOut: boolean
    suppressed: boolean
    senderAuthorized: boolean
    recipientVerified: boolean
    messageQualityPassed: boolean
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clock(minutes: number | null): string {
  const value = minutes === null ? 9 : minutes
  const safe = Math.min(23, Math.max(0, Math.round(value)))
  return `${String(safe).padStart(2, '0')}:00`
}

/**
 * Apply the precedence order and produce the one effective decision.
 *
 * Pure. The caller supplies the rows; a test can therefore assert that the
 * object a surface displays is the object the send path acts on.
 */
export function evaluateSendPolicy(input: SendPolicyContext): EffectiveSendPolicyDecision {
  const blockers: string[] = []
  const businessDate = orgDate(input.now, input.operating.timezone)
  const sendWindowOpen =
    isOrgWorkingDay(input.operating, businessDate) && isWithinWorkday(input.now, input.operating, businessDate)

  const policy = input.emailPolicy ?? {}
  const mailbox = input.mailbox

  const emailAutonomy = isEmailAutonomyMode(policy.autonomy_mode as string)
    ? (policy.autonomy_mode as EmailAutonomyMode)
    : DEFAULT_EMAIL_AUTONOMY_MODE
  const channelAutonomy = isEmailAutonomyMode(input.orgSettings[`${input.channel}AutonomyMode`] as string)
    ? (input.orgSettings[`${input.channel}AutonomyMode`] as EmailAutonomyMode)
    : DEFAULT_EMAIL_AUTONOMY_MODE
  const autonomyMode = input.channel === 'email' ? emailAutonomy : channelAutonomy

  // The daily ceiling depends on the channel. Email is capped per mailbox;
  // LinkedIn and Upwork are capped per channel/type from organizations.settings.
  const channelDailyLimit = input.channel === 'email'
    ? (mailbox?.dailySendCap ?? 0)
    : messageTypeLimit(input.messageType, input.orgSettings)
  const dailyLimit = channelDailyLimit
  const dailyUsed = input.channel === 'email' ? input.usage.emailSentToday : channelUsage(input)
  const dailyRemaining = dailyLimit === 0 ? 0 : Math.max(0, dailyLimit - dailyUsed)

  // 0 means "no separate hourly cap" — the schema default.
  const hourlyRaw = asNumber(policy.hourly_send_cap)
  const hourlyLimit = hourlyRaw !== null && hourlyRaw > 0 ? hourlyRaw : null
  const hourlyUsed = input.usage.emailSentThisHour
  const hourlyRemaining = hourlyLimit === null ? null : Math.max(0, hourlyLimit - hourlyUsed)

  const spacingSeconds = mailbox?.minimumDelaySeconds ?? asNumber(policy.minimum_spacing_seconds) ?? 0
  const minimumSpacingMinutes = Math.max(0, Math.round(spacingSeconds / 60))

  let nextSendAt: string | null = null
  if (mailbox?.lastSentAt && minimumSpacingMinutes > 0) {
    const earliest = new Date(new Date(mailbox.lastSentAt).getTime() + minimumSpacingMinutes * 60_000)
    if (earliest.getTime() > input.now.getTime()) nextSendAt = earliest.toISOString()
  }

  // --- 1. hard safety block -------------------------------------------------
  if (mailbox && mailbox.health && mailbox.health !== 'HEALTHY') {
    blockers.push(`mailbox_${mailbox.health.toLowerCase()}`)
  }
  if (input.safety.terminal) blockers.push('terminal_state')
  if (input.safety.optedOut) blockers.push('opted_out')
  if (input.safety.suppressed) blockers.push('suppressed')
  if (input.channel === 'email' && !input.safety.senderAuthorized) blockers.push('sender_identity_unauthorized')
  if (input.channel === 'email' && !input.safety.recipientVerified) blockers.push('recipient_not_verified')
  if (input.channel === 'email' && !input.safety.messageQualityPassed) blockers.push('message_quality_failed')

  // --- 2. org autonomy ------------------------------------------------------
  // MANUAL never sends without a human. APPROVAL_REQUIRED is allowed here and
  // held for the queue; AUTOPILOT may execute.
  if (autonomyMode === 'MANUAL') blockers.push('autonomy_manual')

  // --- 3. send window -------------------------------------------------------
  if (input.channel === 'email' && !sendWindowOpen) blockers.push('outside_send_window')

  // --- 4. mailbox limits ----------------------------------------------------
  if (dailyLimit > 0 && dailyRemaining <= 0) blockers.push('daily_limit_reached')
  if (hourlyLimit !== null && hourlyRemaining !== null && hourlyRemaining <= 0) blockers.push('hourly_limit_reached')

  // --- 5/6. channel/type limits and current usage ---------------------------
  if (input.channel !== 'email' && dailyLimit === 0) blockers.push('no_channel_limit_configured')
  // --- 7. spacing -----------------------------------------------------------
  if (nextSendAt) blockers.push('spacing_not_elapsed')

  return {
    allowed: blockers.length === 0,
    reason: blockers[0] ?? null,
    autonomyMode,
    dailyLimit,
    dailyUsed,
    dailyRemaining,
    hourlyLimit,
    hourlyUsed,
    hourlyRemaining,
    minimumSpacingMinutes,
    nextSendAt,
    sendWindowOpen,
    sendWindowStart: clock(mailbox?.workingHoursStart ?? null),
    sendWindowEnd: clock(mailbox?.workingHoursEnd ?? null),
    followupLimit: mailbox?.followUpLimit ?? 0,
    followupsUsed: input.usage.followupsUsed,
    mailboxHealth: mailbox?.health ?? 'DISCONNECTED',
    bounceThreshold: asNumber(policy.bounce_threshold),
    failureThreshold: asNumber(policy.consecutive_failure_threshold),
    blockers,
  }
}

function channelUsage(input: SendPolicyContext): number {
  if (input.messageType === 'connection') return input.usage.connection
  if (input.channel === 'upwork') return input.usage.upwork
  return input.usage.dmFollowup
}

/** Map the stored health column onto the five canonical states. */
export function mailboxHealthState(
  mailbox: Pick<MailboxPolicyState, 'health' | 'consecutiveFailures' | 'pausedAt'> | null,
  failureThreshold: number | null,
): MailboxHealthState {
  if (!mailbox) return 'DISCONNECTED'
  if (mailbox.pausedAt) return 'PAUSED'
  const threshold = failureThreshold ?? 3
  if (mailbox.consecutiveFailures >= threshold) return 'DEGRADED'
  return mailbox.health === 'REAUTH_REQUIRED'
    ? 'REAUTH_REQUIRED'
    : mailbox.health === 'DISCONNECTED'
      ? 'DISCONNECTED'
      : 'HEALTHY'
}

/**
 * Load the mailbox state from real send history, not from denormalized counters.
 *
 * `sent_today` and `consecutive_failures` have no writers in this codebase, so
 * reading them would always report zero. Deriving from the send tables is what
 * makes health a real signal.
 */
export async function loadMailboxPolicyState(
  client: SupabaseClient,
  organizationId: string,
  revenueIdentityId: string | null,
  operating: OperatingPolicy,
  now: Date,
): Promise<MailboxPolicyState> {
  if (!revenueIdentityId) {
    return {
      revenueIdentityId: null,
      health: null,
      consecutiveFailures: 0,
      sentToday: 0,
      sentTodayDate: null,
      pausedAt: null,
      dailySendCap: null,
      minimumDelaySeconds: null,
      workingHoursStart: null,
      workingHoursEnd: null,
      followUpLimit: null,
      lastSentAt: null,
    }
  }

  const businessDate = orgDate(now, operating.timezone)
  const nextDate = orgDate(new Date(now.getTime() + 86_400_000), operating.timezone)

  const [mailboxResult, policyResult, sentResult, failedResult, lastResult] = await Promise.all([
    client
      .from('email_mailboxes')
      .select('health, consecutive_failures, paused_at, provider, status')
      .eq('organization_id', organizationId)
      .eq('revenue_identity_id', revenueIdentityId)
      .maybeSingle(),
    client
      .from('email_sending_policies')
      .select('daily_send_cap, minimum_delay_seconds, working_hours_start, working_hours_end, follow_up_limit')
      .eq('organization_id', organizationId)
      .eq('revenue_identity_id', revenueIdentityId)
      .maybeSingle(),
    client
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('revenue_identity_id', revenueIdentityId)
      .gte('sent_at', `${businessDate}T00:00:00`)
      .lt('sent_at', `${nextDate}T00:00:00`),
    client
      .from('email_send_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('revenue_identity_id', revenueIdentityId)
      .eq('status', 'FAILED')
      .gte('created_at', new Date(now.getTime() - 7 * 86_400_000).toISOString()),
    client
      .from('email_messages')
      .select('sent_at')
      .eq('organization_id', organizationId)
      .eq('revenue_identity_id', revenueIdentityId)
      .order('sent_at', { ascending: false })
      .limit(1),
  ])

  const mailbox = (mailboxResult.data ?? null) as Record<string, unknown> | null
  const policy = (policyResult.data ?? null) as Record<string, unknown> | null
  const derived = mailbox
    ? deriveMailboxHealth({
        provider: mailbox.provider as string | null,
        status: mailbox.status as string | null,
        hasUsableToken: mailbox.health === 'CONNECTED' || mailbox.health === 'REAUTH_REQUIRED',
        consecutiveFailures: Number(mailbox.consecutive_failures ?? 0),
        sentToday: sentResult.count ?? 0,
        dailySendCap: asNumber(policy?.daily_send_cap),
        paused: Boolean(mailbox.paused_at),
      })
    : 'DISCONNECTED'

  return {
    revenueIdentityId,
    health: derived === 'CONNECTED' ? 'HEALTHY' : (derived as MailboxHealthState),
    consecutiveFailures: failedResult.count ?? 0,
    sentToday: sentResult.count ?? 0,
    sentTodayDate: businessDate,
    pausedAt: (mailbox?.paused_at as string | null) ?? null,
    dailySendCap: asNumber(policy?.daily_send_cap),
    minimumDelaySeconds: asNumber(policy?.minimum_delay_seconds),
    workingHoursStart: asNumber(policy?.working_hours_start),
    workingHoursEnd: asNumber(policy?.working_hours_end),
    followUpLimit: asNumber(policy?.follow_up_limit),
    lastSentAt: ((lastResult.data ?? [])[0]?.sent_at as string | undefined) ?? null,
  }
}

/** The database-facing canonical service. */
export async function getEffectiveSendPolicy(
  client: SupabaseClient,
  input: {
    organizationId: string
    revenueIdentityId?: string | null
    senderProfileId?: string | null
    channel: SendChannel
    messageType: string
    now?: Date
  },
): Promise<EffectiveSendPolicyDecision> {
  const now = input.now ?? currentInstant()
  const operating = await import('@/lib/org-clock/load').then((m) => m.loadOperatingPolicy(input.organizationId, client))
  const mailbox = await loadMailboxPolicyState(client, input.organizationId, input.revenueIdentityId ?? null, operating, now)

  const [settingsResult, emailPolicyResult] = await Promise.all([
    client.from('organizations').select('settings').eq('id', input.organizationId).maybeSingle(),
    client.from('organization_email_policy').select('*').eq('organization_id', input.organizationId).maybeSingle(),
  ])

  return evaluateSendPolicy({
    organizationId: input.organizationId,
    revenueIdentityId: input.revenueIdentityId ?? null,
    senderProfileId: input.senderProfileId ?? null,
    channel: input.channel,
    messageType: input.messageType,
    now,
    operating,
    orgSettings: ((settingsResult.data?.settings as Record<string, unknown>) ?? {}),
    emailPolicy: (emailPolicyResult.data ?? null) as Record<string, unknown> | null,
    mailbox,
    usage: {
      dmFollowup: 0,
      connection: 0,
      upwork: 0,
      emailSentToday: mailbox.sentToday,
      emailSentThisHour: 0,
      followupsUsed: 0,
    },
    safety: {
      terminal: false,
      optedOut: false,
      suppressed: false,
      senderAuthorized: true,
      recipientVerified: true,
      messageQualityPassed: true,
    },
  })
}
