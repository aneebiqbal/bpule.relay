import type { DbClient } from '@/lib/db/types'
/**
 * Targets V2 (Phase 8 / Slice C) — read-only, auditable.
 *
 * Goals: the existing `daily_targets` rows (rep × sending identity × activity
 * type, daily). WEEK / MONTH goals are derived as daily goal × working days
 * in the period and labelled as derived. Team targets, custom periods,
 * pause / archive and meeting targets need new persistence (migration) and
 * are reported as not available — never simulated.
 *
 * Progress: canonical executed events only (same rule as Team Performance —
 * drafts, generated copy, recommendations and failed sends never count).
 * Every number drills down to the events behind it.
 */
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { MEETING_EVENT } from '@/lib/sales/meetings'
import { CONNECTION_EVENTS, SENT_MESSAGE_EVENTS } from '@/lib/sales/send-truth'
import { targetProgressSql } from '@/lib/analytics/aggregates'
import { primaryRepByIdentity } from '@/lib/targets/plan-scope'

export type TargetType = 'CONNECTIONS' | 'MESSAGES_SENT' | 'UPWORK_APPLICATIONS' | 'MEETINGS' | 'PROPOSALS'
export type TargetPeriod = 'DAY' | 'WEEK' | 'MONTH'
export type TargetStatus = 'met' | 'on_track' | 'at_risk' | 'no_target'

export const TARGET_TYPES: Array<{ type: TargetType; label: string; events: string[]; activityEvent: string }> = [
  { type: 'CONNECTIONS', label: 'Connections', events: [...CONNECTION_EVENTS], activityEvent: 'CONNECTION_SENT' },
  { type: 'MESSAGES_SENT', label: 'Messages sent', events: [...SENT_MESSAGE_EVENTS], activityEvent: 'MESSAGES_SENT' },
  { type: 'UPWORK_APPLICATIONS', label: 'Upwork applications', events: ['UPWORK_APPLIED', 'UPWORK_APPLICATION_SUBMITTED'], activityEvent: 'UPWORK_APPLICATION_SUBMITTED' },
  { type: 'MEETINGS', label: 'Meetings', events: [MEETING_EVENT], activityEvent: MEETING_EVENT },
  { type: 'PROPOSALS', label: 'Proposals', events: ['UPWORK_PROPOSAL_PREPARED'], activityEvent: 'UPWORK_PROPOSAL_PREPARED' },
]

export const PERIODS: Array<{ value: TargetPeriod; label: string; range: 'today' | '7d' | '30d'; workingDays: number }> = [
  { value: 'DAY', label: 'Today', range: 'today', workingDays: 1 },
  { value: 'WEEK', label: 'Last 7 days', range: '7d', workingDays: 5 },
  { value: 'MONTH', label: 'Last 30 days', range: '30d', workingDays: 22 },
]

/** Stored daily_targets.activity_type → canonical target type. Others are not canonical targets. */
export function targetTypeForActivity(activityType: string): TargetType | null {
  switch (activityType) {
    case 'connection_request':
      return 'CONNECTIONS'
    case 'dm':
    case 'followup':
    case 'email':
      return 'MESSAGES_SENT'
    case 'application':
      return 'UPWORK_APPLICATIONS'
    case 'proposal':
      return 'PROPOSALS'
    case 'meeting':
    case 'meetings':
      return 'MEETINGS'
    default:
      return null
  }
}

/** Executed event → target type, or null (drafts, failures, non-target events). */
export function targetTypeForEvent(actionType: string, executionStatus?: string | null): TargetType | null {
  if (executionStatus === 'failed') return null
  return TARGET_TYPES.find((t) => t.events.includes(actionType))?.type ?? null
}

/** Pure: on-track compares progress to the share of the period elapsed. */
export function targetStatus(goal: number | null, progress: number, elapsedShare: number): TargetStatus {
  if (!goal) return 'no_target'
  if (progress >= goal) return 'met'
  return progress >= goal * Math.min(1, Math.max(0, elapsedShare)) * 0.8 ? 'on_track' : 'at_risk'
}

export interface TargetCell {
  type: TargetType
  goal: number | null
  progress: number
  remaining: number | null
  status: TargetStatus
  /** Goal derived from a daily target × working days (WEEK / MONTH). */
  derived: boolean
}

export interface TargetOwnerRow {
  ownerId: string
  ownerName: string
  kind: 'rep' | 'team'
  cells: TargetCell[]
}

export interface TargetsData {
  period: TargetPeriod
  reps: TargetOwnerRow[]
  teams: TargetOwnerRow[]
  /** Activity types with targets that are not canonical (e.g. prospects captured). */
  ignoredActivityTypes: string[]
  available: boolean
}

/** Pure: assemble rows from goals and executed events. */
export function assembleTargets(input: {
  period: TargetPeriod
  elapsedShare: number
  reps: Array<{ id: string; name: string }>
  teams: Array<{ id: string; name: string; memberIds: string[] }>
  dailyTargets: Array<{ rep_id: string; activity_type: string; target_count: number }>
  events: Array<{ actor_id: string | null; action_type: string; execution_status: string | null }>
  /**
   * Pre-counted progress (`rep|type` → n) from the SQL aggregate. When present
   * the event tally is skipped, so a grouped read never expands back into one
   * object per event.
   */
  progress?: Map<string, number>
}): Omit<TargetsData, 'available'> {
  const period = PERIODS.find((p) => p.value === input.period)!
  const factor = period.workingDays
  const goals = new Map<string, number>() // `${rep}|${type}` → daily goal
  const ignored = new Set<string>()
  for (const t of input.dailyTargets) {
    const type = targetTypeForActivity(t.activity_type)
    if (!type) {
      ignored.add(t.activity_type)
      continue
    }
    const key = `${t.rep_id}|${type}`
    goals.set(key, (goals.get(key) ?? 0) + t.target_count)
  }
  const progress = input.progress ?? countTargetProgress(input.events)

  const cell = (goalDaily: number | null, done: number, type: TargetType): TargetCell => {
    const goal = goalDaily === null ? null : goalDaily * factor
    return {
      type,
      goal,
      progress: done,
      remaining: goal === null ? null : Math.max(0, goal - done),
      status: targetStatus(goal, done, input.elapsedShare),
      derived: goal !== null && factor > 1,
    }
  }

  const reps: TargetOwnerRow[] = input.reps.map((r) => ({
    ownerId: r.id,
    ownerName: r.name,
    kind: 'rep',
    cells: TARGET_TYPES.map(({ type }) => cell(goals.get(`${r.id}|${type}`) ?? null, progress.get(`${r.id}|${type}`) ?? 0, type)),
  }))

  const teams: TargetOwnerRow[] = input.teams.map((t) => ({
    ownerId: t.id,
    ownerName: t.name,
    kind: 'team',
    cells: TARGET_TYPES.map(({ type }) => {
      let goal: number | null = null
      let done = 0
      for (const m of t.memberIds) {
        const g = goals.get(`${m}|${type}`)
        if (g !== undefined) goal = (goal ?? 0) + g
        done += progress.get(`${m}|${type}`) ?? 0
      }
      return cell(goal, done, type)
    }),
  }))

  return { period: input.period, reps, teams, ignoredActivityTypes: [...ignored].sort() }
}

const EVENT_CAP = 10_000

/** Executed event → `rep|type` progress. Shared by both read paths. */
function countTargetProgress(
  events: Array<{ actor_id: string | null; action_type: string; execution_status: string | null }>,
): Map<string, number> {
  const progress = new Map<string, number>()
  for (const e of events) {
    if (!e.actor_id) continue
    const type = targetTypeForEvent(e.action_type, e.execution_status)
    if (!type) continue
    const key = `${e.actor_id}|${type}`
    progress.set(key, (progress.get(key) ?? 0) + 1)
  }
  return progress
}

export async function loadTargets(
  client: DbClient,
  input: {
    orgId: string
    reps: Array<{ id: string; name: string }>
    teams: Array<{ id: string; name: string; memberIds: string[] }>
    period: TargetPeriod
    window: { start: string; end: string }
    elapsedShare: number
  },
): Promise<TargetsData & { truncated: boolean }> {
  const repIds = input.reps.map((r) => r.id)
  if (repIds.length === 0) {
    return { ...assembleTargets({ ...input, dailyTargets: [], events: [] }), available: true, truncated: false }
  }
  const [planRead, targetRead] = await Promise.all([
    client
      .from('daily_target_plans')
      .select('revenue_identity_id, activity_type, target_count')
      .eq('organization_id', input.orgId)
      .eq('active', true),
    loadTargetEvents(client, input, repIds),
  ])
  if (planRead.error && !isMissingRelation(planRead.error)) throw planRead.error
  // The requirement is channel-owned; project it onto the current operator.
  const repByIdentity = await primaryRepByIdentity(
    client,
    input.orgId,
    (planRead.data ?? []).map((row) => row.revenue_identity_id as string),
  )
  const targetRows = (planRead.data ?? []).map((row) => ({
    rep_id: repByIdentity.get(row.revenue_identity_id as string) ?? 'unassigned',
    activity_type: row.activity_type,
    target_count: row.target_count,
  })).filter((row) => repIds.includes(row.rep_id))
  const assembled = assembleTargets({
    ...input,
    dailyTargets: targetRows,
    events: targetRead.rows ?? [],
    progress: targetRead.grouped ?? undefined,
  })
  return { ...assembled, available: !planRead.error, truncated: targetRead.rows ? targetRead.rows.length >= EVENT_CAP : false }
}

/**
 * Executed target events for the window. On Neon this is one GROUP BY over
 * (actor, action type) — a handful of rows instead of up to 10,000 events — so
 * the aggregate can never hit the read cap. Supabase keeps the capped read.
 */
type TargetEventRead =
  | { grouped: Map<string, number>; rows: null }
  | { grouped: null; rows: Array<{ actor_id: string | null; action_type: string; execution_status: string | null }> }

async function loadTargetEvents(
  client: DbClient,
  input: { orgId: string; window: { start: string; end: string } },
  repIds: string[],
): Promise<TargetEventRead> {
  if (client.provider === 'neon' && client.raw) {
    const { sql, params } = targetProgressSql({
      orgId: input.orgId,
      repIds,
      start: input.window.start,
      end: input.window.end,
    })
    const { data, error } = await client.raw<{ key: string; action_type: string; n: number }>(sql, params)
    if (!error && Array.isArray(data)) {
      const grouped = new Map<string, number>()
      for (const row of data as Array<{ key: string; action_type: string; n: number }>) {
        const type = targetTypeForEvent(row.action_type, null)
        if (!type) continue
        const key = `${row.key}|${type}`
        grouped.set(key, (grouped.get(key) ?? 0) + Number(row.n))
      }
      return { grouped, rows: null }
    }
    console.error('[targets] aggregate failed, falling back to event reads')
  }
  const { data, error } = await client
    .from('action_events')
    .select('actor_id, action_type, execution_status')
    .eq('organization_id', input.orgId)
    .in('action_type', TARGET_TYPES.flatMap((t) => t.events))
    .in('actor_id', repIds)
    .gte('occurred_at', input.window.start)
    .lt('occurred_at', input.window.end)
    .limit(EVENT_CAP)
  if (error) throw error
  return { grouped: null, rows: (data ?? []) as Array<{ actor_id: string | null; action_type: string; execution_status: string | null }> }
}
