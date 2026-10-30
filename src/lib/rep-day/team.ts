/**
 * Team day — the canonical server-side contract for the Command Centre.
 *
 * One loader answers, for the whole team and in one bounded set of queries:
 * who has not started, who is active, who is behind, who is critical, who can
 * close, who missed, how much work remains, and what was created today.
 *
 * It is deliberately not per-rep: five batched reads regardless of team size.
 * No page may compute its own status; this is the only team-level derivation.
 *
 * Scope is enforced twice: RLS on `rep_day`/`leads`/`action_events`, and an
 * explicit role check here. A rep is refused; a manager sees only managed
 * teams; an admin sees the organization.
 */
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, type AuthContext } from '@/lib/auth/organization'
import {
  businessDateRange,
  currentInstant,
  isOrgWorkingDay,
  minutesRemaining as minutesRemainingIn,
  orgDate,
  workdayProgress,
  type OperatingPolicy,
} from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { deriveRepDayState, type RepDayState } from './state-machine'

export interface TeamIdentity {
  id: string
  name: string
  channel: string
}

export interface TeamDayRow {
  repId: string
  repName: string
  repRole: string
  state: RepDayState
  checkInAt: string | null
  closedAt: string | null
  lateStart: boolean
  exceptionState: string
  commitmentProgress: number
  requiredRemaining: number
  minutesRemaining: number
  repliesWaiting: number
  actionsToday: number
  pipelineCreated: number
  lastActivityAt: string | null
  identities: TeamIdentity[]
}

export interface TeamDaySummary {
  businessDate: string
  timezone: string
  isWorkingDay: boolean
  workdayProgress: number
  minutesRemaining: number
  workdayStart: string
  workdayEnd: string
  counts: Record<RepDayState, number>
  totals: {
    reps: number
    requiredRemaining: number
    commitmentProgress: number
    repliesWaiting: number
    actionsToday: number
    pipelineCreated: number
  }
  reps: TeamDayRow[]
}

const EMPTY_COUNTS: Record<RepDayState, number> = {
  NOT_STARTED: 0,
  ACTIVE: 0,
  AT_RISK: 0,
  CRITICAL: 0,
  READY_TO_CLOSE: 0,
  CLOSED: 0,
  MISSED: 0,
}

/** Operational severity, not alphabetical. */
export const STATE_PRIORITY: Record<RepDayState, number> = {
  CRITICAL: 0,
  AT_RISK: 1,
  NOT_STARTED: 2,
  ACTIVE: 3,
  READY_TO_CLOSE: 4,
  CLOSED: 5,
  MISSED: 6,
}

const OUTBOUND_ACTIONS = ['CONNECTION_SENT', 'DM_SENT', 'FOLLOWUP_SENT', 'REPLY_SENT']

// Bounded reads: a day's ledger and a team's open leads. If a team ever exceeds
// these, aggregate in SQL rather than raising the limit.
// shortcut: 5,000-row bound on daily ledger/lead scans, upgrade to a SQL aggregate past that.
const SCAN_LIMIT = 5000

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return /does not exist|schema cache/i.test(String(error.message ?? ''))
}

function emptySummary(
  businessDate: string,
  timezone: string,
  isWorkingDay: boolean,
  workdayStart = '09:00',
  workdayEnd = '18:00',
): TeamDaySummary {
  return {
    businessDate,
    timezone,
    isWorkingDay,
    workdayProgress: 0,
    minutesRemaining: 0,
    workdayStart,
    workdayEnd,
    counts: { ...EMPTY_COUNTS },
    totals: { reps: 0, requiredRemaining: 0, commitmentProgress: 0, repliesWaiting: 0, actionsToday: 0, pipelineCreated: 0 },
    reps: [],
  }
}

/** Rep ids the caller may see, or 'all' for org-wide. */
async function scopedRepIds(ctx: AuthContext): Promise<Set<string> | 'all'> {
  if (ctx.isAdmin) return 'all'
  if (!ctx.isManager || ctx.managedTeamIds.length === 0) return new Set()

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('team_memberships')
    .select('person_id')
    .in('team_id', ctx.managedTeamIds)
    .eq('active', true)

  return new Set((data ?? []).map((row) => row.person_id as string))
}

export async function loadTeamDay(): Promise<TeamDaySummary> {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error('Unauthorized')

  const policy: OperatingPolicy = await loadOperatingPolicy(ctx.orgId)
  const now = currentInstant()
  const businessDate = orgDate(now, policy.timezone)
  const isWorkingDay = isOrgWorkingDay(policy, businessDate)
  const base = emptySummary(businessDate, policy.timezone, isWorkingDay, policy.workdayStart, policy.workdayEnd)

  if (!ctx.isAdmin && !ctx.isManager) return base

  const scope = await scopedRepIds(ctx)
  if (scope !== 'all' && scope.size === 0) return base

  const supabase = await createServerSupabase()
  const range = businessDateRange(businessDate, policy.timezone)

  // Five bounded reads, in parallel. No query is per rep.
  const repQuery = supabase.from('reps').select('id, name, role').eq('organization_id', ctx.orgId)
  const dayQuery = supabase
    .from('rep_day')
    .select('rep_id, state, check_in_at, closed_at, commitment_progress, required_remaining, minutes_remaining, exception_state')
    .eq('organization_id', ctx.orgId)
    .eq('business_date', businessDate)
  const assignmentQuery = supabase
    .from('identity_assignments')
    .select('rep_id, revenue_identity_id, identity:revenue_identities(id, identity_name, channel)')
    .eq('organization_id', ctx.orgId)
  const repliedQuery = supabase
    .from('leads')
    .select('owner_rep_id')
    .eq('organization_id', ctx.orgId)
    .eq('status', 'replied')
    .eq('archived', false)
    .limit(SCAN_LIMIT)
  const pipelineQuery = supabase
    .from('leads')
    .select('owner_rep_id')
    .eq('organization_id', ctx.orgId)
    .gte('created_at', range.start)
    .lt('created_at', range.end)
    .limit(SCAN_LIMIT)
  const actionsQuery = supabase
    .from('action_events')
    .select('actor_id, action_type, execution_status, occurred_at')
    .eq('organization_id', ctx.orgId)
    .gte('occurred_at', range.start)
    .lt('occurred_at', range.end)
    .limit(SCAN_LIMIT)

  const [repsResult, daysResult, assignmentsResult, repliedResult, pipelineResult, actionsResult] = await Promise.all([
    scope === 'all' ? repQuery : repQuery.in('id', [...scope]),
    scope === 'all' ? dayQuery : dayQuery.in('rep_id', [...scope]),
    scope === 'all' ? assignmentQuery : assignmentQuery.in('rep_id', [...scope]),
    repliedQuery,
    pipelineQuery,
    actionsQuery,
  ])

  if (repsResult.error) {
    if (isMissingRelation(repsResult.error)) return base
    throw repsResult.error
  }

  // A missing rep_day table is not an error: every rep is simply NOT_STARTED.
  if (daysResult.error && !isMissingRelation(daysResult.error)) throw daysResult.error
  const dayRows = (daysResult.data ?? []) as Array<Record<string, unknown>>
  const dayByRep = new Map(dayRows.map((row) => [row.rep_id as string, row]))

  const identitiesByRep = new Map<string, TeamIdentity[]>()
  for (const row of assignmentsResult.data ?? []) {
    const identity = row.identity as unknown as Record<string, unknown> | null
    if (!identity?.id) continue
    const list = identitiesByRep.get(row.rep_id as string) ?? []
    list.push({
      id: identity.id as string,
      name: (identity.identity_name as string) ?? 'Unnamed identity',
      channel: (identity.channel as string) ?? 'other',
    })
    identitiesByRep.set(row.rep_id as string, list)
  }

  const countByRep = (rows: Array<Record<string, unknown>> | null, key = 'owner_rep_id') => {
    const map = new Map<string, number>()
    for (const row of rows ?? []) {
      const repId = row[key] as string | null
      if (!repId) continue
      map.set(repId, (map.get(repId) ?? 0) + 1)
    }
    return map
  }

  const repliesByRep = countByRep(repliedResult.data as Array<Record<string, unknown>> | null)
  const pipelineByRep = countByRep(pipelineResult.data as Array<Record<string, unknown>> | null)

  const actionsByRep = new Map<string, number>()
  const lastActivityByRep = new Map<string, string>()
  for (const row of (actionsResult.data ?? []) as Array<Record<string, unknown>>) {
    const repId = row.actor_id as string | null
    if (!repId) continue
    const sent = row.execution_status === 'sent' || row.execution_status === 'delivered'
    if (sent && OUTBOUND_ACTIONS.includes(row.action_type as string)) {
      actionsByRep.set(repId, (actionsByRep.get(repId) ?? 0) + 1)
    }
    const occurred = row.occurred_at as string
    if (occurred && (!lastActivityByRep.has(repId) || occurred > lastActivityByRep.get(repId)!)) {
      lastActivityByRep.set(repId, occurred)
    }
  }

  const repsOut: TeamDayRow[] = []
  for (const rep of repsResult.data ?? []) {
    const repId = rep.id as string
    const row = dayByRep.get(repId)

    const checkInAt = (row?.check_in_at as string) ?? null
    const closedAt = (row?.closed_at as string) ?? null
    const exceptionState = (row?.exception_state as string) ?? 'NONE'
    const requiredRemaining = (row?.required_remaining as number) ?? 0
    const commitmentProgress = Number(row?.commitment_progress) || 0

    // Derive from the same state machine the rep sees, so the two cannot
    // disagree. A rep with no row is NOT_STARTED, not invisible.
    const derived = deriveRepDayState({
      policy,
      businessDate,
      now,
      isWorkingDay,
      checkInAt,
      closedAt,
      commitmentProgress,
      requiredRemaining,
      mandatoryRemaining: 0,
      exceptionApproved: exceptionState === 'APPROVED',
    })

    const workdayStartMinutes = Number(policy.workdayStart.slice(0, 2)) * 60 + Number(policy.workdayStart.slice(3, 5))
    const checkInMinutes = checkInAt
      ? (() => {
          const local = new Date(checkInAt).toLocaleTimeString('en-GB', { timeZone: policy.timezone, hour12: false })
          return Number(local.slice(0, 2)) * 60 + Number(local.slice(3, 5))
        })()
      : null

    repsOut.push({
      repId,
      repName: (rep.name as string) ?? 'Unknown',
      repRole: (rep.role as string) ?? 'rep',
      state: derived.state,
      checkInAt,
      closedAt,
      lateStart: checkInMinutes !== null && checkInMinutes > workdayStartMinutes + 5,
      exceptionState,
      commitmentProgress,
      requiredRemaining,
      minutesRemaining: (row?.minutes_remaining as number) ?? derived.minutesRemaining,
      repliesWaiting: repliesByRep.get(repId) ?? 0,
      actionsToday: actionsByRep.get(repId) ?? 0,
      pipelineCreated: pipelineByRep.get(repId) ?? 0,
      lastActivityAt: lastActivityByRep.get(repId) ?? null,
      identities: identitiesByRep.get(repId) ?? [],
    })
  }

  const counts = { ...EMPTY_COUNTS }
  for (const rep of repsOut) counts[rep.state] += 1

  const totals = repsOut.reduce(
    (acc, rep) => {
      acc.requiredRemaining += rep.requiredRemaining
      acc.commitmentProgress += rep.commitmentProgress
      acc.repliesWaiting += rep.repliesWaiting
      acc.actionsToday += rep.actionsToday
      acc.pipelineCreated += rep.pipelineCreated
      return acc
    },
    { requiredRemaining: 0, commitmentProgress: 0, repliesWaiting: 0, actionsToday: 0, pipelineCreated: 0 },
  )

  return {
    businessDate,
    timezone: policy.timezone,
    isWorkingDay,
    workdayProgress: workdayProgress(now, policy, businessDate),
    minutesRemaining: minutesRemainingIn(now, policy, businessDate),
    workdayStart: policy.workdayStart,
    workdayEnd: policy.workdayEnd,
    counts,
    totals: {
      reps: repsOut.length,
      requiredRemaining: totals.requiredRemaining,
      commitmentProgress: repsOut.length > 0 ? totals.commitmentProgress / repsOut.length : 0,
      repliesWaiting: totals.repliesWaiting,
      actionsToday: totals.actionsToday,
      pipelineCreated: totals.pipelineCreated,
    },
    reps: repsOut.sort(compareTeamRows),
  }
}

// ---------------------------------------------------------------------------
// Rep detail — the operational drawer, not the analytics product.
// ---------------------------------------------------------------------------

export interface RepDayDetail {
  repId: string
  repName: string
  businessDate: string
  timezone: string
  state: RepDayState
  checkInAt: string | null
  closedAt: string | null
  commitmentProgress: number
  requiredRemaining: number
  minutesRemaining: number
  exceptionState: string
  exceptionReason: string | null
  exceptionNote: string | null
  shortfall: Record<string, unknown>
  identities: Array<{ id: string; name: string; channel: string }>
  targets: Array<{ activityType: string; target: number; completed: number; remaining: number }>
  totals: { target: number; completed: number; remaining: number }
  actionsToday: number
  repliesWaiting: number
  followUpsDue: number
  pipelineCreated: number
  lastActivityAt: string | null
  warnings: Array<{ type: string; title: string; body: string; createdAt: string }>
}

export async function loadRepDayDetail(repId: string): Promise<RepDayDetail> {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error('Unauthorized')

  const scope = await scopedRepIds(ctx)
  if (scope !== 'all' && !scope.has(repId)) throw new Error('Forbidden')

  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(ctx.orgId)
  const now = currentInstant()
  const businessDate = orgDate(now, policy.timezone)
  const range = businessDateRange(businessDate, policy.timezone)

  const { data: rep } = await supabase
    .from('reps')
    .select('id, name')
    .eq('id', repId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (!rep) throw new Error('Not found')

  const [dayResult, assignmentsResult, targetsResult, accountabilityResult, repliesResult, pipelineResult, actionsResult, notificationsResult] =
    await Promise.all([
      supabase
        .from('rep_day')
        .select('state, check_in_at, closed_at, commitment_progress, required_remaining, minutes_remaining, exception_state, exception_reason, exception_note, shortfall')
        .eq('organization_id', ctx.orgId)
        .eq('rep_id', repId)
        .eq('business_date', businessDate)
        .maybeSingle(),
      supabase
        .from('identity_assignments')
        .select('revenue_identity_id, identity:revenue_identities(id, identity_name, channel)')
        .eq('organization_id', ctx.orgId)
        .eq('rep_id', repId),
      supabase
        .from('daily_targets')
        .select('activity_type, target_count')
        .eq('organization_id', ctx.orgId)
        .eq('rep_id', repId)
        .eq('active', true),
      supabase
        .from('daily_accountability')
        .select('activity_type, completed_count')
        .eq('organization_id', ctx.orgId)
        .eq('rep_id', repId)
        .eq('target_date', businessDate),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.orgId)
        .eq('owner_rep_id', repId)
        .eq('status', 'replied')
        .eq('archived', false),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.orgId)
        .eq('owner_rep_id', repId)
        .gte('created_at', range.start)
        .lt('created_at', range.end),
      supabase
        .from('action_events')
        .select('action_type, execution_status, occurred_at')
        .eq('organization_id', ctx.orgId)
        .eq('actor_id', repId)
        .gte('occurred_at', range.start)
        .lt('occurred_at', range.end)
        .limit(SCAN_LIMIT),
      supabase
        .from('notifications')
        .select('notification_type, title, body, created_at')
        .eq('organization_id', ctx.orgId)
        .eq('recipient_id', repId)
        .in('notification_type', ['day_at_risk', 'day_critical', 'day_ready_to_close', 'day_missed', 'followups_due'])
        .gte('created_at', range.start)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

  const day = (dayResult.data ?? null) as Record<string, unknown> | null
  const exceptionState = (day?.exception_state as string) ?? 'NONE'

  const identities = (assignmentsResult.data ?? [])
    .map((row) => row.identity as unknown as Record<string, unknown> | null)
    .filter((identity): identity is Record<string, unknown> => Boolean(identity?.id))
    .map((identity) => ({
      id: identity.id as string,
      name: (identity.identity_name as string) ?? 'Unnamed identity',
      channel: (identity.channel as string) ?? 'other',
    }))

  const completedByType = new Map(
    (accountabilityResult.data ?? []).map((row) => [row.activity_type as string, (row.completed_count as number) ?? 0]),
  )
  const targets = (targetsResult.data ?? []).map((row) => {
    const target = (row.target_count as number) ?? 0
    const completed = completedByType.get(row.activity_type as string) ?? 0
    return {
      activityType: row.activity_type as string,
      target,
      completed,
      remaining: Math.max(0, target - completed),
    }
  })

  let actionsToday = 0
  let lastActivityAt: string | null = null
  for (const row of (actionsResult.data ?? []) as Array<Record<string, unknown>>) {
    const sent = row.execution_status === 'sent' || row.execution_status === 'delivered'
    if (sent && OUTBOUND_ACTIONS.includes(row.action_type as string)) actionsToday += 1
    const occurred = row.occurred_at as string
    if (occurred && (!lastActivityAt || occurred > lastActivityAt)) lastActivityAt = occurred
  }

  const derived = deriveRepDayState({
    policy,
    businessDate,
    now,
    isWorkingDay: isOrgWorkingDay(policy, businessDate),
    checkInAt: (day?.check_in_at as string) ?? null,
    closedAt: (day?.closed_at as string) ?? null,
    commitmentProgress: Number(day?.commitment_progress) || 0,
    requiredRemaining: (day?.required_remaining as number) ?? 0,
    mandatoryRemaining: 0,
    exceptionApproved: exceptionState === 'APPROVED',
  })

  return {
    repId,
    repName: (rep.name as string) ?? 'Unknown',
    businessDate,
    timezone: policy.timezone,
    state: derived.state,
    checkInAt: (day?.check_in_at as string) ?? null,
    closedAt: (day?.closed_at as string) ?? null,
    commitmentProgress: Number(day?.commitment_progress) || 0,
    requiredRemaining: (day?.required_remaining as number) ?? 0,
    minutesRemaining: (day?.minutes_remaining as number) ?? minutesRemainingIn(now, policy, businessDate),
    exceptionState,
    exceptionReason: (day?.exception_reason as string) ?? null,
    exceptionNote: (day?.exception_note as string) ?? null,
    shortfall: (day?.shortfall as Record<string, unknown>) ?? {},
    identities,
    targets,
    totals: {
      target: targets.reduce((sum, row) => sum + row.target, 0),
      completed: targets.reduce((sum, row) => sum + Math.min(row.completed, row.target), 0),
      remaining: targets.reduce((sum, row) => sum + row.remaining, 0),
    },
    actionsToday,
    repliesWaiting: repliesResult.count ?? 0,
    followUpsDue: 0,
    pipelineCreated: pipelineResult.count ?? 0,
    lastActivityAt,
    warnings: (notificationsResult.data ?? []).map((row) => ({
      type: row.notification_type as string,
      title: row.title as string,
      body: row.body as string,
      createdAt: row.created_at as string,
    })),
  }
}

/** Workday progress for the current organization — used by the Command header. */
export function currentWorkday(policy: OperatingPolicy, businessDate: string, now: Date) {
  return {
    progress: workdayProgress(now, policy, businessDate),
    minutesRemaining: minutesRemainingIn(now, policy, businessDate),
  }
}

/**
 * The Command row order: operational severity first, then the amount of work
 * left, then name. Pure and exported so the order is a tested contract.
 */
export function compareTeamRows(a: TeamDayRow, b: TeamDayRow): number {
  const byState = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state]
  if (byState !== 0) return byState
  // Within NOT_STARTED, a rep who has not checked in is more urgent than one
  // who has checked in but not yet produced work.
  if (a.state === 'NOT_STARTED') {
    const aLate = a.checkInAt ? 0 : 1
    const bLate = b.checkInAt ? 0 : 1
    if (aLate !== bLate) return bLate - aLate
  }
  if (a.requiredRemaining !== b.requiredRemaining) return b.requiredRemaining - a.requiredRemaining
  return a.repName.localeCompare(b.repName)
}
