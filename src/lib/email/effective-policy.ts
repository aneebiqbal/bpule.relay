import type { DbClient } from '@/lib/db/types'
/**
 * The one effective send policy.
 *
 * Send limits live in three places for historical reasons: `organizations.settings`
 * (DM/connection ceilings), `email_sending_policies` (per-mailbox ceilings) and
 * `organization_email_policy` (autonomy and safety). Nothing was wrong with any of
 * them individually — what was wrong was that no single object resolved them, so
 * a surface could read one authority and the send path another.
 *
 * `getEffectiveSendPolicy` is that object. Every surface showing remaining sends,
 * channel availability, autonomy or a send window reads it; the send path reads it
 * immediately before it calls a provider. There is deliberately no second
 * resolver, because a second resolver is how the split returns.
 */
import type { OperatingPolicy } from '@/lib/org-clock'
import { isWithinWorkday, isOrgWorkingDay, orgDate } from '@/lib/org-clock'
import { dailyConnectionSendLimit, dailySendLimit } from '@/lib/ai/config'
import { DEFAULT_EMAIL_AUTONOMY_MODE, isEmailAutonomyMode, type EmailAutonomyMode } from './autonomy'
import { SEND_LIMIT_MAX } from './send-limits'

export interface ChannelBudget {
  limit: number
  used: number
  remaining: number
  exhausted: boolean
}

export interface EffectiveEmailPolicy {
  enabled: boolean
  autonomyMode: EmailAutonomyMode
  /** Per-mailbox daily ceiling, or null when no policy row exists. */
  dailyPerMailbox: number | null
  /** Sends allowed per mailbox per hour. 0 means "no separate hourly cap". */
  hourly: number | null
  /** Minimum minutes between two sends from one mailbox. */
  minimumSpacingMinutes: number | null
  /** Send window, derived from the mailbox policy when set. */
  sendWindow: { start: string; end: string; timezone: string } | null
  maxFollowups: number | null
  pauseAfterFailures: number | null
  bounceThresholdPercent: number | null
  weekendPolicy: 'SKIP' | 'ALLOW'
  requireVerifiedEmail: boolean
}

export interface EffectiveSendPolicy {
  organizationId: string
  now: string
  /** The operating policy is the sole time authority for every window. */
  timezone: string
  withinSendWindow: boolean
  /** Business date in the operating timezone, never raw UTC slicing. */
  businessDate: string
  budgets: {
    dmFollowup: ChannelBudget
    connection: ChannelBudget
    upwork: ChannelBudget
  }
  email: EffectiveEmailPolicy
  /** Per-mailbox email state, keyed by revenue identity. */
  mailboxes: Array<{
    revenueIdentityId: string
    dailyLimit: number | null
    sentToday: number
    remaining: number | null
    lastSentAt: string | null
    /** Null when a spacing rule does not delay the next send. */
    nextSendAvailableAt: string | null
  }>
  autonomy: {
    email: EmailAutonomyMode
    linkedin: EmailAutonomyMode
    upwork: EmailAutonomyMode
  }
}

export interface SendPolicyUsage {
  dmFollowup: number
  connection: number
  upwork: number
}

export interface SendPolicyInput {
  organizationId: string
  now: Date
  operating: OperatingPolicy
  orgSettings: Record<string, unknown>
  /** `organization_email_policy` row, or null when the table/row is absent. */
  emailPolicy: Record<string, unknown> | null
  mailboxPolicies: Array<{
    revenueIdentityId: string
    dailySendCap: number | null
    minimumDelaySeconds: number | null
    workingHoursStart: number | null
    workingHoursEnd: number | null
    followUpLimit: number | null
    sentToday: number
    lastSentAt: string | null
  }>
  usage: SendPolicyUsage
}

function budget(limit: number, used: number): ChannelBudget {
  const safeLimit = Math.min(Math.max(limit, 0), SEND_LIMIT_MAX)
  const remaining = Math.max(0, safeLimit - used)
  return { limit: safeLimit, used, remaining, exhausted: remaining <= 0 }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function minutes(value: number | null): string | null {
  if (value === null || value < 0 || value > 23) return null
  return `${String(value).padStart(2, '0')}:00`
}

/**
 * Resolve every authority into one object.
 *
 * Pure: the caller supplies the rows. This is what makes the parity contract
 * testable — a test can assert that the object the UI reads is the object the
 * send path reads, because they are literally the same function.
 */
export function resolveSendPolicy(input: SendPolicyInput): EffectiveSendPolicy {
  const businessDate = orgDate(input.now, input.operating.timezone)
  const withinSendWindow =
    isOrgWorkingDay(input.operating, businessDate) && isWithinWorkday(input.now, input.operating, businessDate)

  const policy = input.emailPolicy ?? {}
  const autonomyMode = isEmailAutonomyMode(policy.autonomy_mode as string)
    ? (policy.autonomy_mode as EmailAutonomyMode)
    : DEFAULT_EMAIL_AUTONOMY_MODE

  // Channel autonomy is org-level and lives with the send limits, because that is
  // the authority an admin already edits. Email autonomy lives in its own policy.
  const linkedin = isEmailAutonomyMode(input.orgSettings.linkedinAutonomyMode as string)
    ? (input.orgSettings.linkedinAutonomyMode as EmailAutonomyMode)
    : DEFAULT_EMAIL_AUTONOMY_MODE
  const upwork = isEmailAutonomyMode(input.orgSettings.upworkAutonomyMode as string)
    ? (input.orgSettings.upworkAutonomyMode as EmailAutonomyMode)
    : DEFAULT_EMAIL_AUTONOMY_MODE

  const spacingSeconds = asNumber(policy.minimum_spacing_seconds)
  const hourly = asNumber(policy.hourly_send_cap)

  const mailboxes = input.mailboxPolicies.map((mailbox) => {
    const spacingMinutes = mailbox.minimumDelaySeconds === null
      ? null
      : Math.max(1, Math.round(mailbox.minimumDelaySeconds / 60))

    let nextSendAvailableAt: string | null = null
    if (mailbox.lastSentAt && spacingMinutes !== null) {
      const earliest = new Date(new Date(mailbox.lastSentAt).getTime() + spacingMinutes * 60_000)
      if (earliest.getTime() > input.now.getTime()) nextSendAvailableAt = earliest.toISOString()
    }

    const remaining = mailbox.dailySendCap === null
      ? null
      : Math.max(0, mailbox.dailySendCap - mailbox.sentToday)

    return {
      revenueIdentityId: mailbox.revenueIdentityId,
      dailyLimit: mailbox.dailySendCap,
      sentToday: mailbox.sentToday,
      remaining,
      lastSentAt: mailbox.lastSentAt,
      nextSendAvailableAt,
    }
  })

  return {
    organizationId: input.organizationId,
    now: input.now.toISOString(),
    timezone: input.operating.timezone,
    withinSendWindow,
    businessDate,
    budgets: {
      dmFollowup: budget(dailySendLimit(input.orgSettings), input.usage.dmFollowup),
      connection: budget(dailyConnectionSendLimit(input.orgSettings), input.usage.connection + input.usage.upwork),
      upwork: budget(dailyConnectionSendLimit(input.orgSettings), input.usage.upwork),
    },
    email: {
      enabled: policy.enabled !== false,
      autonomyMode,
      dailyPerMailbox: mailboxes.length > 0 ? (mailboxes[0].dailyLimit ?? null) : null,
      hourly,
      minimumSpacingMinutes: spacingSeconds === null ? null : Math.max(1, Math.round(spacingSeconds / 60)),
      sendWindow:
        minutes(asNumber(mailboxWindowStart(input.mailboxPolicies))) !== null
          ? {
              start: minutes(asNumber(mailboxWindowStart(input.mailboxPolicies))) as string,
              end: minutes(asNumber(mailboxWindowEnd(input.mailboxPolicies))) as string,
              timezone: input.operating.timezone,
            }
          : null,
      maxFollowups: input.mailboxPolicies.length > 0 ? (asNumber(input.mailboxPolicies[0].followUpLimit) ?? null) : null,
      pauseAfterFailures: asNumber(policy.consecutive_failure_threshold),
      bounceThresholdPercent: bouncePercent(asNumber(policy.bounce_threshold)),
      weekendPolicy: policy.weekend_policy === 'ALLOW' ? 'ALLOW' : 'SKIP',
      requireVerifiedEmail: policy.require_verified_email !== false,
    },
    mailboxes,
    autonomy: { email: autonomyMode, linkedin, upwork },
  }
}

/** The widest window across mailboxes — the one the admin panel reports. */
function mailboxWindowStart(mailboxes: SendPolicyInput['mailboxPolicies']): number | null {
  const values = mailboxes.map((m) => m.workingHoursStart).filter((v): v is number => v !== null)
  return values.length > 0 ? Math.min(...values) : null
}

function mailboxWindowEnd(mailboxes: SendPolicyInput['mailboxPolicies']): number | null {
  const values = mailboxes.map((m) => m.workingHoursEnd).filter((v): v is number => v !== null)
  return values.length > 0 ? Math.max(...values) : null
}

/** The stored bounce threshold is a count; the panel reports it as a percent. */
function bouncePercent(threshold: number | null): number | null {
  if (threshold === null) return null
  return threshold * 10
}

export function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  const message = String((error as { message?: string } | null)?.message ?? '')
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message)
}

/** Read the rows the resolver needs. Bounded, and tolerant of a missing table. */
export async function loadSendPolicyInput(
  client: DbClient,
  organizationId: string,
  operating: OperatingPolicy,
  usage: SendPolicyUsage,
  now: Date,
): Promise<SendPolicyInput> {
  const [settingsResult, emailPolicyResult, mailboxResult] = await Promise.all([
    client.from('organizations').select('settings').eq('id', organizationId).maybeSingle(),
    client.from('organization_email_policy').select('*').eq('organization_id', organizationId).maybeSingle(),
    client
      .from('email_sending_policies')
      .select('revenue_identity_id, daily_send_cap, minimum_delay_seconds, working_hours_start, working_hours_end, follow_up_limit')
      .eq('organization_id', organizationId)
      .limit(50),
  ])

  if (settingsResult.error) throw settingsResult.error
  // The email policy table is new: an absent table means "no policy", not an
  // outage. Everything else still resolves with the safe defaults.
  const emailPolicy = isMissingRelation(emailPolicyResult.error) ? null : emailPolicyResult.data

  const mailboxPolicies = await Promise.all(
    ((mailboxResult.data ?? []) as Array<Record<string, unknown>>).map(async (row) => {
      const [sentResult, lastResult] = await Promise.all([
        client
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('revenue_identity_id', row.revenue_identity_id as string)
          .gte('sent_at', `${orgDate(now, operating.timezone)}T00:00:00`)
          .lt('sent_at', `${orgDate(new Date(now.getTime() + 86_400_000), operating.timezone)}T00:00:00`),
        client
          .from('email_messages')
          .select('sent_at')
          .eq('organization_id', organizationId)
          .eq('revenue_identity_id', row.revenue_identity_id as string)
          .order('sent_at', { ascending: false })
          .limit(1),
      ])
      return {
        revenueIdentityId: row.revenue_identity_id as string,
        dailySendCap: asNumber(row.daily_send_cap),
        minimumDelaySeconds: asNumber(row.minimum_delay_seconds),
        workingHoursStart: asNumber(row.working_hours_start),
        workingHoursEnd: asNumber(row.working_hours_end),
        followUpLimit: asNumber(row.follow_up_limit),
        sentToday: sentResult.count ?? 0,
        lastSentAt: ((lastResult.data ?? [])[0]?.sent_at as string | undefined) ?? null,
      }
    }),
  )

  return {
    organizationId,
    now,
    operating,
    orgSettings: ((settingsResult.data?.settings as Record<string, unknown>) ?? {}),
    emailPolicy: (emailPolicy ?? null) as Record<string, unknown> | null,
    mailboxPolicies,
    usage,
  }
}

/** Convenience: read the rows and resolve in one call. */
export async function getEffectiveSendPolicy(
  client: DbClient,
  input: { organizationId: string; operating: OperatingPolicy; usage: SendPolicyUsage; now?: Date },
): Promise<EffectiveSendPolicy> {
  const now = input.now ?? new Date()
  const resolved = await loadSendPolicyInput(client, input.organizationId, input.operating, input.usage, now)
  return resolveSendPolicy(resolved)
}
