/**
 * Gather the facts and evaluate the one eligibility gate for a real send.
 *
 * `evaluateEmailSendEligibility` is pure and `resolveSendPolicy` is pure; this is
 * their database-facing half. It exists so the send route, the approval queue and
 * the queued autopilot job all ask the same questions of the same rows.
 *
 * The quota and window checks read the *effective policy* — the same object the
 * admin UI and the rep-facing budget read. That is what makes "displayed equals
 * enforced" a structural property rather than a convention.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { isWithinWorkday, isOrgWorkingDay, currentInstant, orgDate, type OperatingPolicy } from '@/lib/org-clock'
import { evaluateEmailSendEligibility, type EmailSendDecision } from './eligibility'
import { DEFAULT_EMAIL_AUTONOMY_MODE, isEmailAutonomyMode } from './autonomy'
import { deriveMailboxHealth } from './mailbox-health'
import { isSendEligibleContact } from './contact-points'
import { resolveSendPolicy } from './effective-policy'

export interface SendDecisionInput {
  organizationId: string
  leadId: string
  draftId: string
  /** The rep on whose behalf the send happens. */
  repId: string | null
  policy: OperatingPolicy
  now?: Date
}

export async function buildSendDecision(
  client: SupabaseClient,
  input: SendDecisionInput,
): Promise<EmailSendDecision> {
  const now = input.now ?? currentInstant()
  const businessDate = orgDate(now, input.policy.timezone)

  const [
    leadResult,
    draftResult,
    assignmentResult,
    mailboxResult,
    suppressionResult,
    contactResult,
    outboundResult,
    emailPolicyResult,
    mailboxPolicyResult,
  ] = await Promise.all([
    client.from('leads').select('id, status, archived, verdict').eq('organization_id', input.organizationId).eq('id', input.leadId).maybeSingle(),
    client.from('prepared_email_drafts').select('id, revenue_identity_id, contact_point_id, contact_email, draft_status, claim_safety').eq('organization_id', input.organizationId).eq('id', input.draftId).maybeSingle(),
    input.repId
      ? client.from('identity_assignments').select('revenue_identity_id').eq('organization_id', input.organizationId).eq('rep_id', input.repId).limit(50)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    client.from('email_mailboxes').select('id, revenue_identity_id, provider, status, health, paused_at, consecutive_failures, sent_today, sent_today_date').eq('organization_id', input.organizationId).limit(20),
    client.from('email_suppressions').select('reason').eq('organization_id', input.organizationId).eq('lead_id', input.leadId).eq('active', true).limit(20),
    client.from('contact_points').select('id, value, verification_status').eq('organization_id', input.organizationId).eq('lead_id', input.leadId).limit(20),
    client
      .from('email_messages')
      .select('id, direction, delivery_status, sent_at, received_at')
      .eq('organization_id', input.organizationId)
      .eq('lead_id', input.leadId)
      .order('created_at', { ascending: false })
      .limit(20),
    client.from('organization_email_policy').select('*').eq('organization_id', input.organizationId).maybeSingle(),
    client
      .from('email_sending_policies')
      .select('revenue_identity_id, daily_send_cap, minimum_delay_seconds')
      .eq('organization_id', input.organizationId)
      .limit(50),
  ])

  for (const result of [leadResult, draftResult, assignmentResult, mailboxResult, suppressionResult, contactResult, outboundResult, emailPolicyResult, mailboxPolicyResult]) {
    if (result.error) throw result.error
  }

  const lead = (leadResult.data ?? null) as Record<string, unknown> | null
  const draft = (draftResult.data ?? null) as Record<string, unknown> | null
  const assignments = (assignmentResult.data ?? []) as Array<Record<string, unknown>>
  const mailboxes = (mailboxResult.data ?? []) as Array<Record<string, unknown>>
  const suppressions = (suppressionResult.data ?? []) as Array<Record<string, unknown>>
  const contacts = (contactResult.data ?? []) as Array<Record<string, unknown>>
  const messages = (outboundResult.data ?? []) as Array<Record<string, unknown>>
  const emailPolicy = (emailPolicyResult.data ?? null) as Record<string, unknown> | null
  const mailboxPolicies = (mailboxPolicyResult.data ?? []) as Array<Record<string, unknown>>

  const identityId = (draft?.revenue_identity_id as string) ?? null
  const mailbox = mailboxes.find((m) => m.revenue_identity_id === identityId) ?? null
  const mailboxPolicy = mailboxPolicies.find((p) => p.revenue_identity_id === identityId) ?? null
  const contact = contacts.find((c) => c.id === draft?.contact_point_id) ?? null

  // The effective policy is resolved once, here, from the same rows the UI reads.
  // The quota check below is then a read of this object, not a second calculation.
  const effective = resolveSendPolicy({
    organizationId: input.organizationId,
    now,
    operating: input.policy,
    orgSettings: {},
    emailPolicy,
    mailboxPolicies: [
      {
        revenueIdentityId: identityId ?? '',
        dailySendCap: asNumber(mailboxPolicy?.daily_send_cap ?? null),
        minimumDelaySeconds: asNumber(mailboxPolicy?.minimum_delay_seconds ?? null),
        workingHoursStart: null,
        workingHoursEnd: null,
        followUpLimit: null,
        sentToday: mailbox && mailbox.sent_today_date === businessDate ? Number(mailbox.sent_today ?? 0) : 0,
        lastSentAt: null,
      },
    ],
    usage: { dmFollowup: 0, connection: 0, upwork: 0 },
  })

  const mailboxBudget = effective.mailboxes[0] ?? null
  const autonomyMode = emailPolicy?.autonomy_mode
  const mode = isEmailAutonomyMode(autonomyMode as string)
    ? (autonomyMode as 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT')
    : DEFAULT_EMAIL_AUTONOMY_MODE

  const latest = messages[0] ?? null

  return evaluateEmailSendEligibility({
    hasOpportunity: Boolean(lead && !lead.archived && lead.status !== 'dead' && lead.status !== 'no' && lead.status !== 'won' && lead.status !== 'lost'),
    senderIdentityAuthorized: Boolean(identityId && assignments.some((a) => a.revenue_identity_id === identityId)),
    senderIdentityId: identityId,
    mailboxHealth: mailbox
      ? deriveMailboxHealth({
          provider: mailbox.provider as string | null,
          status: mailbox.status as string | null,
          hasUsableToken: mailbox.health === 'CONNECTED' || mailbox.health === 'REAUTH_REQUIRED',
          consecutiveFailures: Number(mailbox.consecutive_failures ?? 0),
          sentToday: mailboxBudget?.sentToday ?? 0,
          dailySendCap: mailboxBudget?.dailyLimit ?? null,
          paused: Boolean(mailbox.paused_at),
        })
      : null,
    recipientEmail: (contact?.value as string) ?? (draft?.contact_email as string) ?? null,
    recipientContactVerified: contact
      ? isSendEligibleContact({
          verificationStatus: contact.verification_status as 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN',
        } as never)
      : false,
    notSuppressed: suppressions.length === 0,
    notOptedOut: !suppressions.some((s) => s.reason === 'OPT_OUT' || s.reason === 'DO_NOT_CONTACT' || s.reason === 'UNSUBSCRIBE'),
    notTerminal: Boolean(lead && lead.status !== 'won' && lead.status !== 'lost' && lead.status !== 'dead' && lead.status !== 'no'),
    notDuplicateContact: !messages.some((m) => m.direction === 'OUTBOUND' && m.delivery_status === 'SENT'),
    noUnansweredInboundReply: latest?.direction !== 'INBOUND',
    withinSendWindow: isOrgWorkingDay(input.policy, businessDate) && isWithinWorkday(now, input.policy, businessDate),
    dailyQuotaAvailable: mailboxBudget ? (mailboxBudget.remaining ?? 0) > 0 : false,
    messageQualityPassed: draft?.draft_status === 'READY',
    claimsSafe: draft?.draft_status === 'READY',
    followUpAllowed: true,
    autonomyMode: mode,
    now,
  })
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Load an organization's email policy, falling back to the safe default. */
export async function loadEmailPolicy(
  client: SupabaseClient,
  organizationId: string,
): Promise<{ autonomyMode: 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT'; enabled: boolean }> {
  const { data, error } = await client
    .from('organization_email_policy')
    .select('autonomy_mode, enabled')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw error
  const mode = data?.autonomy_mode
  return {
    autonomyMode: isEmailAutonomyMode(mode as string) ? (mode as 'MANUAL' | 'APPROVAL_REQUIRED' | 'AUTOPILOT') : DEFAULT_EMAIL_AUTONOMY_MODE,
    enabled: Boolean(data?.enabled),
  }
}
