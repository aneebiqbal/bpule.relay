/**
 * Analytics aggregates.
 *
 * Every dashboard surface counts executed work. Reading each `action_events`
 * row and tallying it in application memory transfers the whole window on every
 * load; these statements return the same numbers as grouped rows instead.
 *
 * The JS authority does not move. `aggregateMetrics`
 * (src/lib/operations/performance.ts) and `canonicalActionFor`
 * (src/lib/performance/activity-model.ts) remain the definition of a send, a
 * reply, a meeting and a win; the SQL below encodes exactly those rules:
 *
 *   - `execution_status = 'failed'` is never counted.
 *   - only the canonical action types are counted.
 *   - `REPLY_SENT` is a message but not an outbound contact — it never adds a
 *     lead to `leadsContacted`, matching `OUTREACH_TYPES`.
 *   - `MEETING_BOOKED` is a meeting, `CLIENT_WON` is a win; the two are never
 *     merged (src/lib/sales/meetings.ts).
 *
 * Every statement is scoped by `organization_id` and runs through the same
 * executor that sets `app.current_user_id`, so RLS applies on top.
 */
import { MEETING_EVENT } from '@/lib/sales/meetings'
import type { OpsSource } from '@/lib/operations/filters'

/** The executed-work types Team Performance counts (WORKED_TYPES). */
export const PERFORMANCE_EVENT_TYPES = [
  'CONNECTION_SENT',
  'DM_SENT',
  'FOLLOWUP_SENT',
  'REPLY_SENT',
  'REPLY_RECEIVED',
  MEETING_EVENT,
  'UPWORK_PROPOSAL_PREPARED',
  'UPWORK_APPLIED',
  'CLIENT_WON',
] as const

/** The types the personal activity heatmap counts (ACTION_MAP keys). */
export const ACTIVITY_EVENT_TYPES = [
  'LEAD_EXTRACTED',
  'LEAD_SAVED',
  'CONNECTION_SENT',
  'DM_SENT',
  'FOLLOWUP_SENT',
  'REPLY_SENT',
  'UPWORK_APPLIED',
  MEETING_EVENT,
  'CLIENT_WON',
  'OPPORTUNITY_CREATED',
  'LEAD_REFERRED',
] as const

/** The types Targets count (TARGET_TYPES events). */
export const TARGET_EVENT_TYPES = [
  'CONNECTION_SENT',
  'DM_SENT',
  'FOLLOWUP_SENT',
  'REPLY_SENT',
  'UPWORK_APPLIED',
  MEETING_EVENT,
  'UPWORK_PROPOSAL_PREPARED',
] as const

const quoteList = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ')

/** The metric columns shared by every performance grouping. */
const METRICS_SELECT = `COUNT(*) FILTER (WHERE action_type = 'CONNECTION_SENT') AS connections,
  COUNT(*) FILTER (WHERE action_type IN ('DM_SENT', 'FOLLOWUP_SENT', 'REPLY_SENT')) AS messages,
  COUNT(*) FILTER (WHERE action_type = 'REPLY_SENT') AS replies_sent,
  COUNT(*) FILTER (WHERE action_type = 'REPLY_RECEIVED') AS replies,
  COUNT(*) FILTER (WHERE action_type = '${MEETING_EVENT}') AS meetings,
  COUNT(*) FILTER (WHERE action_type = 'UPWORK_PROPOSAL_PREPARED') AS proposals,
  COUNT(*) FILTER (WHERE action_type = 'CLIENT_WON') AS wins,
  COUNT(*) FILTER (WHERE action_type = 'UPWORK_APPLIED') AS applications,
  COUNT(DISTINCT lead_id) FILTER (WHERE action_type IN (${quoteList(PERFORMANCE_EVENT_TYPES)})) AS leads_worked,
  COUNT(DISTINCT lead_id) FILTER (WHERE action_type IN ('CONNECTION_SENT', 'DM_SENT', 'FOLLOWUP_SENT')) AS leads_contacted,
  COUNT(DISTINCT lead_id) FILTER (WHERE action_type = 'REPLY_RECEIVED') AS leads_replied`

/** Metric counts without the per-group task tally, which is a separate table. */
export interface MetricCounts {
  connections: number
  messages: number
  repliesSent: number
  replies: number
  meetings: number
  proposals: number
  wins: number
  applications: number
  leadsWorked: number
  leadsContacted: number
  leadsReplied: number
}

/** Map a SQL aggregate row onto the canonical metric counts. */
export function metricCountsFromRow(row: Record<string, unknown>): MetricCounts {
  const n = (key: string): number => Number(row[key] ?? 0)
  return {
    connections: n('connections'),
    messages: n('messages'),
    repliesSent: n('replies_sent'),
    replies: n('replies'),
    meetings: n('meetings'),
    proposals: n('proposals'),
    wins: n('wins'),
    applications: n('applications'),
    leadsWorked: n('leads_worked'),
    leadsContacted: n('leads_contacted'),
    leadsReplied: n('leads_replied'),
  }
}

export interface PerformanceAggregateScope {
  orgId: string
  /** null = whole organization. An empty list never reaches SQL (the caller short-circuits). */
  repIds: string[] | null
  start: string
  end: string
  profileId?: string | null
  source?: OpsSource | null
}

export type PerformanceGroup = 'actor' | 'profile' | 'source' | 'total'

/**
 * Profile attribution is the canonical resolver: the revenue identity built on
 * the event's sending profile, falling back to the lead's identity. A profile
 * used by more than one identity resolves to null (ambiguous), which also falls
 * back — the same rule as `identityResolver`.
 */
const PROFILE_KEY_SQL =
  "COALESCE(CASE WHEN pi.n = 1 THEN pi.identity_id::text END, l.revenue_identity_id::text, 'none')"

/** Source attribution: the lead's canonical bucket, or the event's own channel. */
const SOURCE_KEY_SQL = `CASE WHEN l.id IS NULL THEN
    (CASE WHEN ev.action_type LIKE 'UPWORK_%' THEN 'upwork' ELSE 'other' END)
  ELSE
    (CASE WHEN lower(COALESCE(l.source, '')) = 'linkedin' THEN 'linkedin'
          WHEN lower(COALESCE(l.source, '')) = 'upwork' THEN 'upwork'
          ELSE 'other' END)
  END`

/**
 * One grouped metrics query. `actor` groups by the acting rep, `profile` by the
 * sending identity, `source` by the lead's source bucket, `total` returns a
 * single row. The `profile` / `source` filters are applied before grouping, so
 * every grouping over the same scoped set — exactly what `loadPerformance` does
 * in memory today.
 */
export function performanceMetricsSql(
  group: PerformanceGroup,
  scope: PerformanceAggregateScope,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [scope.orgId, scope.start, scope.end]
  const repIds = scope.repIds && scope.repIds.length > 0 ? scope.repIds : null
  let repFilter = ''
  if (repIds) {
    repFilter = `\n    AND e.actor_id IN (${repIds.map(() => '?').join(', ')})`
    params.push(...repIds)
  }
  // revenue_identities for the profile map, then leads for the identity /
  // source fallback. Both are org-scoped.
  params.push(scope.orgId, scope.orgId)

  const filters: string[] = []
  if (scope.profileId) {
    filters.push('profile_key = ?')
    params.push(scope.profileId)
  }
  if (scope.source) {
    filters.push('source_key = ?')
    params.push(scope.source)
  }
  const filterSql = filters.length ? `\n    AND ${filters.join('\n    AND ')}` : ''

  const select = {
    actor: `SELECT actor_id AS key, ${METRICS_SELECT}\nFROM scoped\nWHERE actor_id IS NOT NULL\nGROUP BY actor_id`,
    profile: `SELECT profile_key AS key, ${METRICS_SELECT}\nFROM scoped\nGROUP BY profile_key`,
    source: `SELECT source_key AS key, ${METRICS_SELECT}\nFROM scoped\nGROUP BY source_key`,
    total: `SELECT ${METRICS_SELECT}\nFROM scoped`,
  }[group]

  return {
    sql: `WITH ev AS (
  SELECT e.actor_id, e.action_type, e.lead_id, e.sender_profile_id
  FROM action_events e
  WHERE e.organization_id = ?
    AND e.action_type IN (${quoteList(PERFORMANCE_EVENT_TYPES)})
    AND e.execution_status IS DISTINCT FROM 'failed'
    AND e.occurred_at >= ?
    AND e.occurred_at < ?${repFilter}
), pi AS (
  SELECT profile_id, COUNT(*) AS n, MIN(id::text)::uuid AS identity_id
  FROM revenue_identities
  WHERE organization_id = ? AND profile_id IS NOT NULL
  GROUP BY profile_id
), attributed AS (
  SELECT
    ev.actor_id,
    ev.action_type,
    ev.lead_id,
    ${PROFILE_KEY_SQL} AS profile_key,
    ${SOURCE_KEY_SQL} AS source_key
  FROM ev
  LEFT JOIN pi ON pi.profile_id = ev.sender_profile_id
  LEFT JOIN leads l ON l.id = ev.lead_id AND l.organization_id = ?
), scoped AS (
  SELECT actor_id, action_type, lead_id, profile_key, source_key
  FROM attributed
  WHERE 1 = 1${filterSql}
)
${select}`,
    params,
  }
}

export interface WindowScope {
  orgId: string
  repIds: string[] | null
  start: string
  end: string
}

/** Target progress: executed counts per (actor, action type). */
export function targetProgressSql(scope: WindowScope): { sql: string; params: unknown[] } {
  const params: unknown[] = [scope.orgId, scope.start, scope.end]
  let repFilter = ''
  if (scope.repIds && scope.repIds.length > 0) {
    repFilter = `\n  AND actor_id IN (${scope.repIds.map(() => '?').join(', ')})`
    params.push(...scope.repIds)
  }
  return {
    sql: `SELECT actor_id AS key, action_type, COUNT(*) AS n
FROM action_events
WHERE organization_id = ?
  AND action_type IN (${quoteList(TARGET_EVENT_TYPES)})
  AND execution_status IS DISTINCT FROM 'failed'
  AND occurred_at >= ?
  AND occurred_at < ?${repFilter}
  AND actor_id IS NOT NULL
GROUP BY actor_id, action_type`,
    params,
  }
}

export interface ActivityDailyScope {
  orgId: string
  repId: string
  start: string
  end: string
  /** IANA zone the heatmap's day boundaries follow. */
  timezone: string
}

export interface TeamTrendScope {
  orgId: string
  repIds: string[] | null
  start: string
  end: string
  timezone: string
}

/**
 * Team trend — replies received and meetings booked per day, grouped in SQL.
 * Same canonical rules as `performanceMetricsSql`: failed executions never
 * count, and REPLY_RECEIVED / MEETING_BOOKED are distinct events.
 */
export function teamTrendSql(scope: TeamTrendScope): { sql: string; params: unknown[] } {
  const params: unknown[] = [scope.timezone, scope.orgId, scope.start, scope.end]
  let repFilter = ''
  if (scope.repIds && scope.repIds.length > 0) {
    repFilter = `\n      AND actor_id IN (${scope.repIds.map(() => '?').join(', ')})`
    params.push(...scope.repIds)
  }
  return {
    sql: `SELECT (occurred_at AT TIME ZONE ?)::date AS day,
        COUNT(*) FILTER (WHERE action_type = 'REPLY_RECEIVED') AS replies,
        COUNT(*) FILTER (WHERE action_type = '${MEETING_EVENT}') AS meetings
      FROM action_events
      WHERE organization_id = ?
        AND occurred_at >= ?
        AND occurred_at < ?
        AND execution_status IS DISTINCT FROM 'failed'
        AND action_type IN ('REPLY_RECEIVED', '${MEETING_EVENT}')${repFilter}
      GROUP BY 1 ORDER BY 1`,
    params,
  }
}

/** Completed assigned tasks per day — the third trend series. */
export function teamTasksTrendSql(scope: TeamTrendScope): { sql: string; params: unknown[] } {
  const params: unknown[] = [scope.timezone, scope.orgId, scope.start, scope.end]
  let repFilter = ''
  if (scope.repIds && scope.repIds.length > 0) {
    repFilter = `\n      AND assignee_rep_id IN (${scope.repIds.map(() => '?').join(', ')})`
    params.push(...scope.repIds)
  }
  return {
    sql: `SELECT (completed_at AT TIME ZONE ?)::date AS day, COUNT(*) AS tasks
      FROM assigned_tasks
      WHERE organization_id = ?
        AND status = 'DONE'
        AND completed_at >= ?
        AND completed_at < ?${repFilter}
      GROUP BY 1 ORDER BY 1`,
    params,
  }
}

/**
 * Daily heatmap counts. The day is rendered in the organization's zone with
 * `AT TIME ZONE`, which is the same calendar date `Intl` produces — a 23:30 UTC
 * event is already tomorrow in Asia/Karachi.
 */
export function activityDailySql(scope: ActivityDailyScope): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT (occurred_at AT TIME ZONE ?)::date AS day, action_type, COUNT(*) AS n
FROM action_events
WHERE organization_id = ?
  AND actor_id = ?
  AND occurred_at >= ?
  AND occurred_at < ?
  AND execution_status IS DISTINCT FROM 'failed'
  AND action_type IN (${quoteList(ACTIVITY_EVENT_TYPES)})
GROUP BY 1, 2`,
    params: [scope.timezone, scope.orgId, scope.repId, scope.start, scope.end],
  }
}

/** The first raw event in the window, before any canonical filter. */
export function activityCoverageSql(scope: Omit<ActivityDailyScope, 'timezone'>): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT MIN(occurred_at) AS coverage_start
FROM action_events
WHERE organization_id = ?
  AND actor_id = ?
  AND occurred_at >= ?
  AND occurred_at < ?`,
    params: [scope.orgId, scope.repId, scope.start, scope.end],
  }
}

/**
 * The raw events for one clicked day, for the drilldown only. The heatmap
 * itself never asks for them.
 */
export function activityDayEventsSql(scope: ActivityDailyScope): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT id, action_type, execution_status, lead_id, job_id, occurred_at
FROM action_events
WHERE organization_id = ?
  AND actor_id = ?
  AND occurred_at >= ?
  AND occurred_at < ?
  AND execution_status IS DISTINCT FROM 'failed'
  AND action_type IN (${quoteList(ACTIVITY_EVENT_TYPES)})
ORDER BY occurred_at ASC`,
    params: [scope.orgId, scope.repId, scope.start, scope.end],
  }
}
