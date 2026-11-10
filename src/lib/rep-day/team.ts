import { createServerSupabase } from '@/lib/supabase/server'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
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
import { deriveConversationRow } from '@/lib/operations/conversations'
import { personNameFromProfile } from '@/lib/profiles/person-name'
import { chunkedIn } from '@/lib/supabase/chunked-in'

export interface TeamIdentity {
  id: string
  name: string
  channel: string
  profileId?: string | null
  personKey?: string | null
  profileName?: string | null
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
  if (!ctx.isManager) return new Set()

  const supabase = await createServerSupabase()
  const { data } = ctx.managedTeamIds.length
    ? await supabase
        .from('team_memberships')
        .select('person_id')
        .in('team_id', ctx.managedTeamIds)
        .eq('active', true)
    : { data: [] as Array<{ person_id: string }> }

  // Team scope is managed team + self, matching /chats.
  const ids = new Set((data ?? []).map((row) => row.person_id as string))
  ids.add(ctx.repId)
  return ids
}

export async function loadTeamDay(options: { date?: string } = {}): Promise<TeamDaySummary> {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error('Unauthorized')

  const policy: OperatingPolicy = await loadOperatingPolicy(ctx.orgId)
  const now = currentInstant()
  const today = orgDate(now, policy.timezone)
  // A date at or after today is "now"; only a genuinely past day is judged as
  // of its close. Passing today's date must not make the day read as missed.
  const requestedDate = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) && options.date < today
    ? options.date
    : null
  const businessDate = requestedDate ?? today
  const isWorkingDay = isOrgWorkingDay(policy, businessDate)
  const base = emptySummary(businessDate, policy.timezone, isWorkingDay, policy.workdayStart, policy.workdayEnd)

  if (!ctx.isAdmin && !ctx.isManager) return base

  const scope = await scopedRepIds(ctx)
  if (scope !== 'all' && scope.size === 0) return base

  const supabase = await createServerSupabase()
  const range = businessDateRange(businessDate, policy.timezone)
  // A selected past day is judged as of that day's close, not the current clock.
  const asOf = requestedDate ? new Date(range.end) : now

  // Five bounded reads, in parallel. No query is per rep.
  const repQuery = supabase.from('reps').select('id, name, role').eq('organization_id', ctx.orgId)
  const dayQuery = supabase
    .from('rep_day')
    .select('rep_id, state, check_in_at, closed_at, commitment_progress, required_remaining, minutes_remaining, exception_state')
    .eq('organization_id', ctx.orgId)
    .eq('business_date', businessDate)
  const assignmentQuery = supabase
    .from('identity_assignments')
    .select('rep_id, revenue_identity_id')
    .eq('organization_id', ctx.orgId)
  const repliedQuery = supabase
    .from('leads')
    .select('id, owner_rep_id, status')
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
  // The identity rows are a second read rather than a PostgREST embed
  // (`identity:revenue_identities`), which the Neon adapter cannot translate.
  const identityIds = new Set(
    (assignmentsResult.data ?? []).map((row) => row.revenue_identity_id as string).filter(Boolean),
  )
  if (identityIds.size > 0) {
    const { data: identityRows } = await supabase
      .from('revenue_identities')
      .select('id, identity_name, channel, profile_id, person_key')
      .in('id', [...identityIds])
    const byId = new Map((identityRows ?? []).map((r) => [r.id as string, r]))
    const profileIds = [
      ...new Set((identityRows ?? []).map((r) => r.profile_id as string | null).filter(Boolean)),
    ]
    const { data: profileRows } = profileIds.length
      ? await supabase
          .from('profiles')
          .select('id, display_name, full_name, label')
          .in('id', profileIds)
      : { data: [] as Array<{ id: string; display_name: string | null; full_name: string | null; label: string | null }> }
    const profileNameById = new Map(
      (profileRows ?? []).map((p) => [p.id as string, personNameFromProfile(p)]),
    )
    for (const row of assignmentsResult.data ?? []) {
      const identity = byId.get(row.revenue_identity_id as string)
      if (!identity) continue
      const list = identitiesByRep.get(row.rep_id as string) ?? []
      list.push({
        id: identity.id as string,
        name: (identity.identity_name as string) ?? 'Unnamed identity',
        channel: (identity.channel as string) ?? 'other',
        profileId: (identity.profile_id as string | null) ?? null,
        personKey: (identity.person_key as string | null) ?? null,
        profileName: (identity.profile_id as string)
          ? (profileNameById.get(identity.profile_id as string) ?? null)
          : null,
      })
      identitiesByRep.set(row.rep_id as string, list)
    }
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

  // Canonical Inbox waiting state: the latest meaningful message is the client's.
  // The app stamps lead status 'replied' on every inbound, so the replied scan is
  // the canonical candidate set; the conversation timestamps decide.
  const repliedRows = (repliedResult.data ?? []) as Array<{ id: string; owner_rep_id: string | null; status: string }>
  const stateRows = repliedRows.length > 0
    ? await chunkedIn<{
        lead_id: string
        stage: string | null
        last_sent_at: string | null
        last_reply_at: string | null
        next_followup_at: string | null
        won_at: string | null
        lost_at: string | null
      }>(
        repliedRows.map((row) => row.id),
        (chunk) =>
          supabase
            .from('conversation_states')
            .select('lead_id, stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at')
            .in('lead_id', chunk),
      )
    : []
  const stateByLead = new Map(stateRows.map((row) => [row.lead_id, row]))
  const repliesByRep = new Map<string, number>()
  for (const row of repliedRows) {
    if (!row.owner_rep_id) continue
    const state = stateByLead.get(row.id)
    const derived = deriveConversationRow(
      {
        id: row.id,
        contactName: null,
        company: null,
        companyKey: null,
        ownerRepId: row.owner_rep_id,
        profileName: null,
        status: row.status,
      },
      state
        ? {
            stage: state.stage,
            lastSentAt: state.last_sent_at,
            lastReplyAt: state.last_reply_at,
            nextFollowupAt: state.next_followup_at,
            wonAt: state.won_at,
            lostAt: state.lost_at,
          }
        : null,
      null,
      asOf.getTime(),
    )
    if (derived?.state === 'waiting_on_rep') {
      repliesByRep.set(row.owner_rep_id, (repliesByRep.get(row.owner_rep_id) ?? 0) + 1)
    }
  }
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
      now: asOf,
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
    workdayProgress: workdayProgress(asOf, policy, businessDate),
    minutesRemaining: minutesRemainingIn(asOf, policy, businessDate),
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
  identities: Array<{ id: string; name: string; channel: string; profileId?: string | null; personKey?: string | null; profileName?: string | null }>
  targets: Array<{ identityId: string; identityName: string | null; activityType: string; target: number; completed: number; remaining: number }>
  totals: { target: number; completed: number; remaining: number }
  actionsToday: number
  repliesWaiting: number
  followUpsDue: number
  pipelineCreated: number
  lastActivityAt: string | null
  warnings: Array<{ type: string; title: string; body: string; createdAt: string }>
}

export async function loadRepDayDetail(repId: string, options: { date?: string } = {}): Promise<RepDayDetail> {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error('Unauthorized')

  const scope = await scopedRepIds(ctx)
  if (scope !== 'all' && !scope.has(repId)) throw new Error('Forbidden')

  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(ctx.orgId)
  const now = currentInstant()
  const today = orgDate(now, policy.timezone)
  const requestedDate = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) && options.date < today
    ? options.date
    : null
  const businessDate = requestedDate ?? today
  const range = businessDateRange(businessDate, policy.timezone)
  // A selected past day is judged as of that day's close, not the current clock.
  const asOf = requestedDate ? new Date(range.end) : now

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
      listExecutableIdentitiesForRep(supabase, ctx.orgId, repId, businessDate),
      supabase
        .from('daily_targets')
        .select('revenue_identity_id, activity_type, target_count')
        .eq('organization_id', ctx.orgId)
        .eq('rep_id', repId)
        .eq('active', true),
      supabase
        .from('daily_accountability')
        .select('revenue_identity_id, activity_type, completed_count')
        .eq('organization_id', ctx.orgId)
        .eq('rep_id', repId)
        .eq('target_date', businessDate),
      supabase
        .from('leads')
        .select('id, status')
        .eq('organization_id', ctx.orgId)
        .eq('owner_rep_id', repId)
        .eq('archived', false)
        .limit(SCAN_LIMIT),
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

  // The identity rows are a second read rather than a PostgREST embed
  // (`identity:revenue_identities`), which the Neon adapter cannot translate.
  const identityIds = (assignmentsResult ?? [])
    .map((row) => row.id as string)
    .filter(Boolean)
  const identityById = new Map<string, Record<string, unknown>>()
  if (identityIds.length > 0) {
    const { data: identityRows } = await supabase
      .from('revenue_identities')
      .select('id, identity_name, channel')
      .in('id', identityIds)
    for (const row of identityRows ?? []) identityById.set(row.id as string, row)
  }

  const identities = identityIds
    .map((id) => identityById.get(id) ?? null)
    .filter((identity): identity is Record<string, unknown> => Boolean(identity))
    .map((identity) => ({
      id: identity.id as string,
      name: (identity.identity_name as string) ?? 'Unnamed identity',
      channel: (identity.channel as string) ?? 'other',
    }))

  const completedByType = new Map(
    (accountabilityResult.data ?? []).map((row) => [
      `${row.revenue_identity_id as string}:${row.activity_type as string}`,
      (row.completed_count as number) ?? 0,
    ]),
  )
  const targets = (targetsResult.data ?? []).map((row) => {
    const target = (row.target_count as number) ?? 0
    const completed = completedByType.get(`${row.revenue_identity_id as string}:${row.activity_type as string}`) ?? 0
    return {
      identityId: row.revenue_identity_id as string,
      identityName: identityById.get(row.revenue_identity_id as string)?.identity_name as string ?? null,
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

  // Canonical Inbox state for this rep: derive from conversation timestamps,
  // never from the stored lead status.
  const leadRows = (repliesResult.data ?? []) as Array<{ id: string; status: string }>
  const leadStateRows = leadRows.length > 0
    ? await chunkedIn<{
        lead_id: string
        stage: string | null
        last_sent_at: string | null
        last_reply_at: string | null
        next_followup_at: string | null
        won_at: string | null
        lost_at: string | null
      }>(
        leadRows.map((row) => row.id),
        (chunk) =>
          supabase
            .from('conversation_states')
            .select('lead_id, stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at')
            .in('lead_id', chunk),
      )
    : []
  const leadStateByLead = new Map(leadStateRows.map((row) => [row.lead_id, row]))
  let repliesWaiting = 0
  let followUpsDue = 0
  for (const lead of leadRows) {
    const state = leadStateByLead.get(lead.id)
    const row = deriveConversationRow(
      {
        id: lead.id,
        contactName: null,
        company: null,
        companyKey: null,
        ownerRepId: repId,
        profileName: null,
        status: lead.status,
      },
      state
        ? {
            stage: state.stage,
            lastSentAt: state.last_sent_at,
            lastReplyAt: state.last_reply_at,
            nextFollowupAt: state.next_followup_at,
            wonAt: state.won_at,
            lostAt: state.lost_at,
          }
        : null,
      null,
      asOf.getTime(),
    )
    if (row?.state === 'waiting_on_rep') repliesWaiting += 1
    if (row?.state === 'follow_up_due') followUpsDue += 1
  }

  const derived = deriveRepDayState({
    policy,
    businessDate,
    now: asOf,
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
    minutesRemaining: (day?.minutes_remaining as number) ?? minutesRemainingIn(asOf, policy, businessDate),
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
    repliesWaiting,
    followUpsDue,
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
