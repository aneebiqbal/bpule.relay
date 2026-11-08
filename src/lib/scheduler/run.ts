import type { DbClient } from '@/lib/db/types'
/**
 * The operational worker.
 *
 * One global cron drains `operational_jobs` for every organization according to
 * that organization's local clock. It does not create one cron per organization.
 *
 * Idempotency: planning is deterministic, the outbox is unique on
 * (organization_id, dedupe_key), and each job is claimed with a conditional
 * update so two overlapping runs cannot execute the same job twice.
 *
 * Failure: every job records attempt, last_error and next_attempt_at, and is
 * dead-lettered after max_attempts. Nothing fails silently.
 */
import { notifyForEvent, notifyOnce } from '@/lib/notifications/deliver'
import { createServiceSupabase } from '@/lib/supabase/service'
import {
  businessDateRange,
  currentInstant,
  isAfterWorkday,
  isOrgWorkingDay,
  minutesRemaining,
  nextOperatingDay,
  orgDate,
  workdayProgress,
  type OperatingPolicy,
} from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { deriveRepDayState } from '@/lib/rep-day/state-machine'
import { syncOrganizationMailboxes } from '@/lib/email/sync'
import { reconcileAcceptedSend } from '@/lib/email/reconcile'
import { buildSendDecision } from '@/lib/email/send-decision'
import { createStoreForRep } from '@/lib/email/store-context'
import { sendPreparedEmail } from '@/lib/email/service'
import { planOperationalJobs, recoveredRepIds, type OperationalJobKind } from './plan'

export interface SchedulerSummary {
  ok: boolean
  error?: string
  organizations: number
  planned: number
  /** Jobs actually written by this run. */
  inserted: number
  /** Jobs that already existed — a repeat run is all alreadyExisting. */
  alreadyExisting: number
  executed: number
  failed: number
  deadLettered: number
}

interface JobRow {
  id: string
  organization_id: string
  business_date: string
  rep_id: string | null
  job_kind: OperationalJobKind
  time_bucket: string
  attempt: number
  max_attempts: number
  payload: Record<string, unknown>
}

interface RepDayRow {
  id: string
  rep_id: string
  state: string
  check_in_at: string | null
  closed_at: string | null
  commitment_progress: number | string
  required_remaining: number
  exception_state: string
  shortfall: Record<string, unknown> | null
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return /does not exist|schema cache/i.test(String(error.message ?? ''))
}

function backoffMinutes(attempt: number): number {
  return Math.min(60, 2 ** Math.max(0, attempt - 1))
}

// One notification writer for the whole app (src/lib/notifications/deliver.ts).
export { notifyOnce }

async function loadRepDays(
  client: DbClient,
  organizationId: string,
  businessDate: string,
): Promise<RepDayRow[]> {
  const { data, error } = await client
    .from('rep_day')
    .select('id, rep_id, state, check_in_at, closed_at, commitment_progress, required_remaining, exception_state, shortfall')
    .eq('organization_id', organizationId)
    .eq('business_date', businessDate)

  if (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
  return (data ?? []) as RepDayRow[]
}

/**
 * Every rep in the organization gets a day row when the day opens, so a rep who
 * has not checked in is still visible as NOT_STARTED.
 *
 * Without this the scheduler has nothing to evaluate until someone checks in:
 * `refreshRepDays` only updates rows that already exist, so an un-checked-in rep
 * is invisible all day and the day only becomes visible once it is already over.
 */
export async function ensureRepDays(
  client: DbClient,
  organizationId: string,
  businessDate: string,
  policy: OperatingPolicy,
) {
  const { data: reps, error } = await client
    .from('reps')
    .select('id')
    .eq('organization_id', organizationId)

  if (error) {
    if (isMissingRelation(error)) return { reps: 0 }
    throw error
  }
  if (!reps || reps.length === 0) return { reps: 0 }

  // A row created mid-day must reflect work that already happened. Otherwise a
  // rep who has been active all morning without a row would appear NOT_STARTED
  // until their next check-in.
  const range = businessDateRange(businessDate, policy.timezone)
  const { data: activity, error: activityError } = await client
    .from('action_events')
    .select('actor_id')
    .eq('organization_id', organizationId)
    .gte('occurred_at', range.start)
    .lt('occurred_at', range.end)
    .limit(5000)

  const active = new Set<string>()
  if (!activityError && activity) {
    for (const row of activity) {
      if (row.actor_id) active.add(row.actor_id as string)
    }
  }

  const { error: upsertError } = await client.from('rep_day').upsert(
    reps.map((rep) => ({
      organization_id: organizationId,
      rep_id: rep.id as string,
      business_date: businessDate,
      state: active.has(rep.id as string) ? 'ACTIVE' : 'NOT_STARTED',
    })),
    { onConflict: 'organization_id,rep_id,business_date', ignoreDuplicates: true },
  )
  if (upsertError && !isMissingRelation(upsertError)) throw upsertError

  return { reps: reps.length, active: active.size }
}

async function openDay(
  client: DbClient,
  organizationId: string,
  businessDate: string,
  policy: OperatingPolicy,
) {
  const { error } = await client.from('organization_day').upsert(
    { organization_id: organizationId, business_date: businessDate, state: 'OPEN' },
    { onConflict: 'organization_id,business_date', ignoreDuplicates: true },
  )
  if (error && !isMissingRelation(error)) throw error

  // Only materialise rep days while the day can still be worked. A day that is
  // already over was never tracked, and inventing rows for it would mark every
  // rep MISSED on the first activation run.
  if (isAfterWorkday(currentInstant(), policy, businessDate)) {
    return { opened: true, reps: 0, skipped: 'after_workday' }
  }

  const { reps } = await ensureRepDays(client, organizationId, businessDate, policy)
  return { opened: true, reps }
}

async function refreshRepDays(
  client: DbClient,
  policy: OperatingPolicy,
  organizationId: string,
  businessDate: string,
) {
  const now = currentInstant()
  const rows = await loadRepDays(client, organizationId, businessDate)
  let refreshed = 0

  for (const row of rows) {
    if (row.closed_at) continue
    const derived = deriveRepDayState({
      policy,
      businessDate,
      now,
      isWorkingDay: isOrgWorkingDay(policy, businessDate),
      checkInAt: row.check_in_at,
      closedAt: row.closed_at,
      commitmentProgress: Number(row.commitment_progress) || 0,
      requiredRemaining: row.required_remaining ?? 0,
      // required_remaining already includes mandatory replies.
      mandatoryRemaining: 0,
      exceptionApproved: row.exception_state === 'APPROVED',
    })

    const { error } = await client
      .from('rep_day')
      .update({
        state: derived.state,
        workday_progress: Number(derived.workdayProgress.toFixed(4)),
        pace_ratio: derived.paceRatio === null ? null : Number(derived.paceRatio.toFixed(3)),
        minutes_remaining: derived.minutesRemaining,
        updated_at: now.toISOString(),
      })
      .eq('id', row.id)

    if (error) throw error
    refreshed += 1
  }

  return { refreshed }
}

async function emitWarnings(
  client: DbClient,
  policy: OperatingPolicy,
  organizationId: string,
  businessDate: string,
) {
  const rows = await loadRepDays(client, organizationId, businessDate)
  const now = currentInstant()
  let sent = 0

  for (const row of rows) {
    if (row.closed_at) continue
    const derived = deriveRepDayState({
      policy,
      businessDate,
      now,
      isWorkingDay: isOrgWorkingDay(policy, businessDate),
      checkInAt: row.check_in_at,
      closedAt: row.closed_at,
      commitmentProgress: Number(row.commitment_progress) || 0,
      requiredRemaining: row.required_remaining ?? 0,
      mandatoryRemaining: 0,
      exceptionApproved: row.exception_state === 'APPROVED',
    })

    if (derived.state !== 'AT_RISK' && derived.state !== 'CRITICAL' && derived.state !== 'READY_TO_CLOSE') continue

    const remaining = row.required_remaining ?? 0
    const minutes = minutesRemaining(now, policy, businessDate)
    const title =
      derived.state === 'CRITICAL'
        ? 'Critical: today’s commitment is at risk'
        : derived.state === 'AT_RISK'
          ? 'At risk: you are behind today’s target'
          : 'Ready to close your day'

    const body =
      derived.state === 'READY_TO_CLOSE'
        ? 'Your required work is complete. Close your day.'
        : `${Math.floor(minutes / 60)}h ${minutes % 60}m remain. ${remaining} required ${remaining === 1 ? 'action is' : 'actions are'} incomplete.`

    const didSend = await notifyOnce(client, {
      organizationId,
      recipientId: row.rep_id,
      type: `day_${derived.state.toLowerCase()}`,
      title,
      body,
      link: '/dashboard',
      dedupeKey: `warning:${businessDate}:${row.rep_id}:${derived.state}`,
    })
    if (didSend) sent += 1
  }

  return { sent }
}

/**
 * TASK_OVERDUE: open assigned tasks past due get one notice per task per due
 * time (`task_overdue:<taskId>:<dueAt>`), so repeated scheduler runs never
 * re-notify and a reschedule starts a new window. Runs inside EMIT_WARNING —
 * existing scheduled infrastructure, no new job kind. Skipped while the task
 * tables are not migrated.
 */
export async function emitOverdueTaskNotifications(
  client: DbClient,
  organizationId: string,
  now: Date,
): Promise<{ overdue: number; notified: number }> {
  const { data, error } = await client
    .from('assigned_tasks')
    .select('id, assignee_rep_id, title, due_at')
    .eq('organization_id', organizationId)
    .in('status', ['OPEN', 'IN_PROGRESS'])
    .not('due_at', 'is', null)
    .lt('due_at', now.toISOString())
    .order('due_at', { ascending: true })
    .limit(200)
  if (error) {
    if (isMissingRelation(error)) return { overdue: 0, notified: 0 }
    throw error
  }
  let notified = 0
  for (const task of (data ?? []) as Array<{ id: string; assignee_rep_id: string | null; title: string | null; due_at: string }>) {
    if (!task.assignee_rep_id) continue
    const result = await notifyForEvent(client, organizationId, {
      kind: 'TASK_OVERDUE',
      taskId: task.id,
      assigneeRepId: task.assignee_rep_id,
      title: task.title ?? 'Task',
      dueAt: task.due_at,
    })
    if (result === 'delivered') notified += 1
  }
  return { overdue: data?.length ?? 0, notified }
}

/**
 * TASK_DUE_SOON: one notice per task per due date, inside the existing warning
 * job. A task due within 24h that is not already overdue gets a single nudge.
 */
export async function emitDueSoonTaskNotifications(
  client: DbClient,
  organizationId: string,
  now: Date,
): Promise<{ dueSoon: number; notified: number }> {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await client
    .from('assigned_tasks')
    .select('id, assignee_rep_id, title, due_at')
    .eq('organization_id', organizationId)
    .in('status', ['OPEN', 'IN_PROGRESS'])
    .not('due_at', 'is', null)
    .gte('due_at', now.toISOString())
    .lte('due_at', horizon)
    .order('due_at', { ascending: true })
    .limit(200)
  if (error) {
    if (isMissingRelation(error)) return { dueSoon: 0, notified: 0 }
    throw error
  }
  let notified = 0
  for (const task of (data ?? []) as Array<{ id: string; assignee_rep_id: string | null; title: string | null; due_at: string }>) {
    if (!task.assignee_rep_id) continue
    const didSend = await notifyOnce(client, {
      organizationId,
      recipientId: task.assignee_rep_id,
      type: 'task_due_soon',
      title: 'Task due soon',
      body: task.title ?? 'Task',
      link: `/tasks?task=assigned:${task.id}`,
      dedupeKey: `task_due_soon:${task.id}:${task.due_at}`,
    })
    if (didSend) notified += 1
  }
  return { dueSoon: data?.length ?? 0, notified }
}

async function emitEscalations(
  client: DbClient,
  organizationId: string,
  businessDate: string,
  policy: OperatingPolicy,
) {
  const rows = await loadRepDays(client, organizationId, businessDate)
  const critical = rows.filter((row) => !row.closed_at && row.state === 'CRITICAL')

  const { data: roles } = await client
    .from('organization_roles')
    .select('person_id, role')
    .eq('organization_id', organizationId)
    .in('role', ['OWNER', 'ADMIN', 'MANAGER'])

  const { data: reps } = await client
    .from('reps')
    .select('id, name')
    .eq('organization_id', organizationId)

  const nameById = new Map((reps ?? []).map((rep) => [rep.id as string, rep.name as string]))
  let sent = 0

  for (const row of critical) {
    const repName = nameById.get(row.rep_id) ?? 'A rep'
    const recipients = new Set<string>([row.rep_id])
    for (const role of roles ?? []) recipients.add(role.person_id as string)

    for (const recipientId of recipients) {
      const didSend = await notifyOnce(client, {
        organizationId,
        recipientId,
        type: 'rep_day_critical',
        title: `${repName} is critical today`,
        body: `${row.required_remaining} required ${row.required_remaining === 1 ? 'action is' : 'actions are'} incomplete.`,
        link: '/admin/command',
        dedupeKey: `escalation:${businessDate}:${row.rep_id}:${recipientId}`,
      })
      if (didSend) sent += 1
    }
  }

  // Recovery: a rep who was escalated and is no longer critical is recorded
  // once, so the history shows the day turning around.
  const { data: priorNotifications } = await client
    .from('notifications')
    .select('recipient_id, notification_type')
    .eq('organization_id', organizationId)
    .in('notification_type', ['rep_day_critical', 'rep_day_recovered'])
    .gte('created_at', businessDateRange(businessDate, policy.timezone).start)
    .lt('created_at', businessDateRange(businessDate, policy.timezone).end)

  const escalated = new Set<string>()
  const alreadyRecovered = new Set<string>()
  for (const notification of priorNotifications ?? []) {
    const repId = notification.recipient_id as string
    if (notification.notification_type === 'rep_day_critical') escalated.add(repId)
    if (notification.notification_type === 'rep_day_recovered') alreadyRecovered.add(repId)
  }

  const stillCritical = new Set(critical.map((row) => row.rep_id))
  const recovered = recoveredRepIds(escalated, alreadyRecovered, stillCritical)
  let recoveries = 0

  for (const repId of recovered) {
    const didSend = await notifyOnce(client, {
      organizationId,
      recipientId: repId,
      type: 'rep_day_recovered',
      title: 'You are back on pace',
      body: 'Today is no longer critical. Finish the remaining work and close your day.',
      link: '/dashboard',
      dedupeKey: `recovery:${businessDate}:${repId}`,
    })
    if (didSend) recoveries += 1
  }

  return { sent, recoveries }
}

async function closeMissedDays(
  client: DbClient,
  policy: OperatingPolicy,
  organizationId: string,
  businessDate: string,
) {
  const now = currentInstant()
  if (!isAfterWorkday(now, policy, businessDate)) return { closed: 0 }

  const rows = await loadRepDays(client, organizationId, businessDate)
  let closed = 0

  for (const row of rows) {
    if (row.closed_at) continue
    const shortfall = {
      closedIncomplete: true,
      autoClosed: true,
      requiredRemaining: row.required_remaining ?? 0,
    }
    const { error } = await client
      .from('rep_day')
      .update({
        state: 'MISSED',
        shortfall,
        carryover: {
          from: businessDate,
          requiredRemaining: row.required_remaining ?? 0,
        },
        updated_at: now.toISOString(),
      })
      .eq('id', row.id)

    if (error) throw error
    closed += 1

    await notifyOnce(client, {
      organizationId,
      recipientId: row.rep_id,
      type: 'day_missed',
      title: 'Today is recorded as missed',
      body: `${row.required_remaining ?? 0} required ${row.required_remaining === 1 ? 'action was' : 'actions were'} incomplete at the end of the workday.`,
      link: '/dashboard',
      dedupeKey: `missed:${businessDate}:${row.rep_id}`,
    })
  }

  return { closed }
}

async function prepareCarryover(
  client: DbClient,
  policy: OperatingPolicy,
  organizationId: string,
  businessDate: string,
) {
  const rows = await loadRepDays(client, organizationId, businessDate)
  const nextDate = nextOperatingDay(policy, businessDate)
  let prepared = 0

  for (const row of rows) {
    if (!row.closed_at) continue
    const outstanding = row.shortfall?.commitments
    const carryover = {
      from: businessDate,
      requiredRemaining: row.required_remaining ?? 0,
      commitments: Array.isArray(outstanding) ? outstanding : [],
    }

    const { error } = await client.from('rep_day').upsert(
      {
        organization_id: organizationId,
        rep_id: row.rep_id,
        business_date: nextDate,
        state: 'NOT_STARTED',
        carryover,
      },
      { onConflict: 'organization_id,rep_id,business_date', ignoreDuplicates: true },
    )
    if (error && !isMissingRelation(error)) throw error
    prepared += 1
  }

  return { prepared, nextDate }
}

async function evaluateFollowUps(
  client: DbClient,
  organizationId: string,
  businessDate: string,
) {
  const { data: leads, error } = await client
    .from('leads')
    .select('owner_rep_id')
    .eq('organization_id', organizationId)
    .eq('status', 'followed_up')
    .eq('archived', false)
    .limit(1000)

  if (error) {
    if (isMissingRelation(error)) return { sent: 0 }
    throw error
  }

  const counts = new Map<string, number>()
  for (const lead of leads ?? []) {
    const repId = lead.owner_rep_id as string | null
    if (!repId) continue
    counts.set(repId, (counts.get(repId) ?? 0) + 1)
  }

  let sent = 0
  for (const [repId, count] of counts) {
    const didSend = await notifyOnce(client, {
      organizationId,
      recipientId: repId,
      type: 'followups_due',
      title: `${count} ${count === 1 ? 'follow-up is' : 'follow-ups are'} waiting`,
      body: 'Follow-ups due outrank fresh sourcing. Clear them before collecting more.',
      link: '/leads?filter=followup',
      dedupeKey: `followup:${businessDate}:${repId}`,
    })
    if (didSend) sent += 1
  }

  return { sent }
}

async function syncMailboxes(client: DbClient, organizationId: string) {
  const summaries = await syncOrganizationMailboxes(client, organizationId)
  return {
    scanned: summaries.reduce((n, s) => n + s.scanned, 0),
    imported: summaries.reduce((n, s) => n + s.imported, 0),
    duplicates: summaries.reduce((n, s) => n + s.duplicates, 0),
    reviewRequired: summaries.reduce((n, s) => n + s.reviewRequired, 0),
    mailboxes: summaries.length,
    failures: summaries.filter((s) => s.failure).map((s) => ({ mailboxId: s.mailboxId, failure: s.failure })),
  }
}

/**
 * Reconcile sends the provider accepted but Relay failed to record.
 *
 * Without this a retry would email a prospect twice: the provider already
 * delivered the message, and the local row is the only thing that says so.
 */
/**
 * Enqueue a send job for every draft that is ready to go.
 *
 * This job never sends. It creates the `SEND_EMAIL` work item that the send job
 * then evaluates — so a draft that becomes ineligible (opt-out, terminal, quota)
 * is dropped by the same gate the manual route uses, rather than by a second rule.
 */
async function enqueueEmailWork(client: DbClient, organizationId: string, businessDate: string) {
  const { data: drafts, error } = await client
    .from('prepared_email_drafts')
    .select('id, revenue_identity_id')
    .eq('organization_id', organizationId)
    .eq('draft_status', 'READY')
    .limit(200)

  if (error) {
    if (isMissingRelation(error)) return { enqueued: 0, drafts: 0 }
    throw error
  }

  let enqueued = 0
  for (const draft of drafts ?? []) {
    const draftId = draft.id as string
    const { data: inserted, error: upsertError } = await client
      .from('operational_jobs')
      .upsert(
        {
          organization_id: organizationId,
          business_date: businessDate,
          rep_id: null,
          job_kind: 'SEND_EMAIL',
          time_bucket: draftId,
          dedupe_key: `${businessDate}:SEND_EMAIL:${draftId}`,
          payload: { draftId, revenueIdentityId: draft.revenue_identity_id },
          next_attempt_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,dedupe_key', ignoreDuplicates: true },
      )
      .select('id')

    if (upsertError) {
      if (isMissingRelation(upsertError)) return { enqueued, drafts: (drafts ?? []).length }
      throw upsertError
    }
    if (inserted && inserted.length > 0) enqueued += 1
  }

  return { enqueued, drafts: (drafts ?? []).length }
}

/**
 * Execute one queued send.
 *
 * The eligibility gate runs again here — immediately before the provider call —
 * because the facts it read when the job was enqueued have certainly changed. A
 * draft held for approval is left alone; a blocked draft is marked FAILED with
 * its blockers so the rep can see why.
 */
async function sendQueuedEmail(
  client: DbClient,
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const draftId = payload.draftId as string | undefined
  if (!draftId) return { skipped: 'missing_draft_id' }

  const { data: draft, error: draftError } = await client
    .from('prepared_email_drafts')
    .select('id, lead_id, revenue_identity_id, draft_status')
    .eq('organization_id', organizationId)
    .eq('id', draftId)
    .maybeSingle()

  if (draftError) throw draftError
  if (!draft) return { skipped: 'draft_not_found' }
  if (draft.draft_status === 'SENT') return { skipped: 'already_sent' }

  const { data: lead, error: leadError } = await client
    .from('leads')
    .select('id, owner_rep_id')
    .eq('organization_id', organizationId)
    .eq('id', draft.lead_id as string)
    .maybeSingle()

  if (leadError) throw leadError
  if (!lead) return { skipped: 'lead_not_found' }

  const repId = (lead.owner_rep_id as string | null) ?? null

  // Without an owner rep there is no identity assignment to check against, so
  // the send cannot be authorized. Fail closed rather than inventing a sender.
  if (!repId) {
    await client
      .from('prepared_email_drafts')
      .update({ draft_status: 'FAILED', blocked_reason: 'sender_identity_unauthorized', updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', draftId)
    return { blocked: ['sender_identity_unauthorized'] }
  }

  const policy = await loadOperatingPolicy(organizationId, client)
  const decision = await buildSendDecision(client, {
    organizationId,
    leadId: draft.lead_id as string,
    draftId,
    repId,
    policy,
  })

  if (!decision.eligible) {
    const nowIso = new Date().toISOString()
    await client
      .from('prepared_email_drafts')
      .update({ draft_status: 'FAILED', blocked_reason: decision.blockers.join(','), updated_at: nowIso })
      .eq('organization_id', organizationId)
      .eq('id', draftId)
    return { blocked: decision.blockers, reason: decision.reason }
  }

  if (decision.action === 'APPROVAL_REQUIRED') return { held: 'approval_required' }
  if (decision.action === 'PREPARE_ONLY') return { held: 'manual_mode' }

  const store = await createStoreForRep(client, organizationId, repId as string)
  const leadId = draft.lead_id as string
  const result = await sendPreparedEmail({
    client,
    store,
    orgId: organizationId,
    repId,
    leadId,
    draftId,
    idempotencyKey: `email:${leadId}:${draftId}`,
  })

  return { sent: true, emailMessageId: result.emailMessage.id, idempotent: result.idempotent }
}

async function retryEmails(client: DbClient, organizationId: string) {
  const { data: attempts, error } = await client
    .from('email_send_attempts')
    .select('provider, provider_message_id')
    .eq('organization_id', organizationId)
    .eq('status', 'FAILED')
    .eq('failure_reason', 'persist_failed_after_provider_accept')
    .not('provider_message_id', 'is', null)
    .limit(50)

  if (error) {
    if (isMissingRelation(error)) return { checked: 0, reconciled: 0 }
    throw error
  }

  let reconciled = 0
  for (const attempt of attempts ?? []) {
    const result = await reconcileAcceptedSend(client, {
      organizationId,
      provider: attempt.provider as string,
      providerMessageId: attempt.provider_message_id as string,
    })
    if (result.reconciled) reconciled += 1
  }

  return { checked: attempts?.length ?? 0, reconciled }
}

async function executeJob(client: DbClient, row: JobRow): Promise<Record<string, unknown>> {
  const organizationId = row.organization_id
  const businessDate = row.business_date
  const policy = await loadOperatingPolicy(organizationId, client)

  switch (row.job_kind) {
    case 'OPEN_DAY':
      return openDay(client, organizationId, businessDate, policy)
    case 'EVALUATE_REP_DAY':
      return refreshRepDays(client, policy, organizationId, businessDate)
    case 'EMIT_WARNING': {
      const warnings = await emitWarnings(client, policy, organizationId, businessDate)
      const now = currentInstant()
      const tasks = await emitOverdueTaskNotifications(client, organizationId, now)
      const dueSoon = await emitDueSoonTaskNotifications(client, organizationId, now)
      return {
        ...warnings,
        overdueTasks: tasks.overdue,
        overdueNotified: tasks.notified,
        dueSoonTasks: dueSoon.dueSoon,
        dueSoonNotified: dueSoon.notified,
      }
    }
    case 'EMIT_ESCALATION':
      return emitEscalations(client, organizationId, businessDate, policy)
    case 'CLOSE_MISSED_DAY':
      return closeMissedDays(client, policy, organizationId, businessDate)
    case 'PREPARE_CARRYOVER':
      return prepareCarryover(client, policy, organizationId, businessDate)
    case 'EVALUATE_FOLLOWUP':
      return evaluateFollowUps(client, organizationId, businessDate)
    case 'SYNC_MAILBOX':
      return syncMailboxes(client, organizationId)
    case 'RETRY_EMAIL':
      return retryEmails(client, organizationId)
    case 'ENQUEUE_EMAIL':
      // Enqueues draft work only. Sending requires an eligibility decision and,
      // outside AUTOPILOT, a human approval — neither is this job's authority.
      return enqueueEmailWork(client, organizationId, businessDate)
    case 'SEND_EMAIL':
      return sendQueuedEmail(client, organizationId, row.payload)
    case 'SEND_FOLLOWUP':
    case 'PROCESS_INBOUND_EMAIL':
      // Handled by the same worker once planned; not yet planned because the
      // follow-up generator that produces them does not exist yet.
      return { skipped: 'not_planned' }
  }
}

export async function runOperationalScheduler(options: {
  now?: Date
  organizationId?: string
  limit?: number
  client?: DbClient
} = {}): Promise<SchedulerSummary> {
  const now = options.now ?? currentInstant()
  const limit = Math.min(500, Math.max(1, options.limit ?? 200))
  const client = options.client ?? createServiceSupabase()

  const summary: SchedulerSummary = {
    ok: true,
    organizations: 0,
    planned: 0,
    inserted: 0,
    alreadyExisting: 0,
    executed: 0,
    failed: 0,
    deadLettered: 0,
  }

  let orgQuery = client.from('organizations').select('id')
  if (options.organizationId) orgQuery = orgQuery.eq('id', options.organizationId)
  const { data: organizations, error: orgError } = await orgQuery.limit(200)

  if (orgError) {
    if (isMissingRelation(orgError)) return { ...summary, ok: false, error: 'organizations table missing' }
    throw orgError
  }

  for (const organization of organizations ?? []) {
    const organizationId = organization.id as string
    summary.organizations += 1

    const policy = await loadOperatingPolicy(organizationId, client)
    const businessDate = orgDate(now, policy.timezone)
    const jobs = planOperationalJobs({ policy, businessDate, now })
    summary.planned += jobs.length

    for (const job of jobs) {
      const { data: inserted, error } = await client.from('operational_jobs').upsert(
        {
          organization_id: job.organizationId,
          business_date: job.businessDate,
          rep_id: job.repId,
          job_kind: job.jobKind,
          time_bucket: job.timeBucket,
          dedupe_key: job.dedupeKey,
          payload: job.payload,
          next_attempt_at: now.toISOString(),
        },
        { onConflict: 'organization_id,dedupe_key', ignoreDuplicates: true },
      ).select('id')

      if (error) {
        if (isMissingRelation(error)) {
          return { ...summary, ok: false, error: 'operational_jobs table missing' }
        }
        throw error
      }
      // ignoreDuplicates returns only the rows this run actually wrote, so the
      // counters describe reality: a repeat run is all alreadyExisting.
      if (inserted && inserted.length > 0) summary.inserted += inserted.length
      else summary.alreadyExisting += 1
    }
  }

  const { data: due, error: dueError } = await client
    .from('operational_jobs')
    .select('id, organization_id, business_date, rep_id, job_kind, time_bucket, attempt, max_attempts, payload')
    .eq('state', 'pending')
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(limit)

  if (dueError) {
    if (isMissingRelation(dueError)) return { ...summary, ok: false, error: 'operational_jobs table missing' }
    throw dueError
  }

  for (const row of (due ?? []) as JobRow[]) {
    const attempt = (row.attempt ?? 0) + 1

    // Claim: only one worker can move this row out of pending.
    const { data: claimed } = await client
      .from('operational_jobs')
      .update({
        state: 'running',
        locked_at: now.toISOString(),
        attempt,
        updated_at: now.toISOString(),
      })
      .eq('id', row.id)
      .eq('state', 'pending')
      .select('id')

    if (!claimed || claimed.length === 0) continue

    try {
      const result = await executeJob(client, row)
      await client
        .from('operational_jobs')
        .update({
          state: 'done',
          completed_at: new Date().toISOString(),
          last_error: null,
          result,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      summary.executed += 1
    } catch (error) {
      summary.failed += 1
      const message = error instanceof Error ? error.message : String(error)
      const dead = attempt >= (row.max_attempts ?? 5)

      if (dead) summary.deadLettered += 1

      await client
        .from('operational_jobs')
        .update({
          state: dead ? 'dead' : 'pending',
          last_error: message.slice(0, 1000),
          next_attempt_at: new Date(now.getTime() + backoffMinutes(attempt) * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
  }

  return summary
}

/** The stage the scheduler would plan right now — used by tests and the cron. */
export function currentStageFor(policy: OperatingPolicy, businessDate: string, now: Date) {
  return {
    progress: workdayProgress(now, policy, businessDate),
    minutesRemaining: minutesRemaining(now, policy, businessDate),
    isWorkingDay: isOrgWorkingDay(policy, businessDate),
  }
}
