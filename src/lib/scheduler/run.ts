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
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceSupabase } from '@/lib/supabase/service'
import {
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
import { planOperationalJobs, type OperationalJobKind } from './plan'

export interface SchedulerSummary {
  ok: boolean
  error?: string
  organizations: number
  planned: number
  enqueued: number
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

export async function notifyOnce(
  client: SupabaseClient,
  input: {
    organizationId: string
    recipientId: string
    type: string
    title: string
    body: string
    link: string
    dedupeKey: string
  },
): Promise<boolean> {
  const { data: existing } = await client
    .from('notifications')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('recipient_id', input.recipientId)
    .eq('dedupe_key', input.dedupeKey)
    .maybeSingle()

  if (existing) return false

  const { error } = await client.from('notifications').insert({
    organization_id: input.organizationId,
    recipient_id: input.recipientId,
    notification_type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    dedupe_key: input.dedupeKey,
  })

  return !error
}

async function loadRepDays(
  client: SupabaseClient,
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

async function openDay(client: SupabaseClient, organizationId: string, businessDate: string) {
  const { error } = await client.from('organization_day').upsert(
    { organization_id: organizationId, business_date: businessDate, state: 'OPEN' },
    { onConflict: 'organization_id,business_date', ignoreDuplicates: true },
  )
  if (error && !isMissingRelation(error)) throw error
  return { opened: true }
}

async function refreshRepDays(
  client: SupabaseClient,
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
  client: SupabaseClient,
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

async function emitEscalations(
  client: SupabaseClient,
  organizationId: string,
  businessDate: string,
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
        link: '/admin/command-center',
        dedupeKey: `escalation:${businessDate}:${row.rep_id}:${recipientId}`,
      })
      if (didSend) sent += 1
    }
  }

  return { sent }
}

async function closeMissedDays(
  client: SupabaseClient,
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
  client: SupabaseClient,
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
  client: SupabaseClient,
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

async function executeJob(client: SupabaseClient, row: JobRow): Promise<Record<string, unknown>> {
  const organizationId = row.organization_id
  const businessDate = row.business_date
  const policy = await loadOperatingPolicy(organizationId, client)

  switch (row.job_kind) {
    case 'OPEN_DAY':
      return openDay(client, organizationId, businessDate)
    case 'EVALUATE_REP_DAY':
      return refreshRepDays(client, policy, organizationId, businessDate)
    case 'EMIT_WARNING':
      return emitWarnings(client, policy, organizationId, businessDate)
    case 'EMIT_ESCALATION':
      return emitEscalations(client, organizationId, businessDate)
    case 'CLOSE_MISSED_DAY':
      return closeMissedDays(client, policy, organizationId, businessDate)
    case 'PREPARE_CARRYOVER':
      return prepareCarryover(client, policy, organizationId, businessDate)
    case 'EVALUATE_FOLLOWUP':
      return evaluateFollowUps(client, organizationId, businessDate)
    case 'ENQUEUE_EMAIL':
      // Deliberately not implemented: email autopilot is a future promotion
      // state, not part of this foundation.
      return { skipped: 'email_autopilot_not_enabled' }
  }
}

export async function runOperationalScheduler(options: {
  now?: Date
  organizationId?: string
  limit?: number
  client?: SupabaseClient
} = {}): Promise<SchedulerSummary> {
  const now = options.now ?? currentInstant()
  const limit = Math.min(500, Math.max(1, options.limit ?? 200))
  const client = options.client ?? createServiceSupabase()

  const summary: SchedulerSummary = {
    ok: true,
    organizations: 0,
    planned: 0,
    enqueued: 0,
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
      const { error } = await client.from('operational_jobs').upsert(
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
      )

      if (error) {
        if (isMissingRelation(error)) {
          return { ...summary, ok: false, error: 'operational_jobs table missing' }
        }
        throw error
      }
      summary.enqueued += 1
    }
  }

  const { data: due, error: dueError } = await client
    .from('operational_jobs')
    .select('id, organization_id, business_date, rep_id, job_kind, time_bucket, attempt, max_attempts')
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
