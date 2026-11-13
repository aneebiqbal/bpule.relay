import { chunkedIn } from '@/lib/supabase/chunked-in'
import type { DbClient } from '@/lib/db/types'
import {
  activityCoverageSql,
  activityDailySql,
  activityDayEventsSql,
} from '@/lib/analytics/aggregates'
import { businessDateRange, isDateString } from '@/lib/org-clock'

// Canonical activity types — mapped from action_events
export type CanonicalAction =
  | 'LEAD_ANALYZED'
  | 'LEAD_SAVED'
  | 'CONNECTION_SENT'
  | 'FIRST_DM_SENT'
  | 'FOLLOWUP_SENT'
  | 'REPLY_SENT'
  | 'UPWORK_APPLIED'
  | 'MEETING_BOOKED'
  | 'LEAD_WON'
  | 'LEAD_REFERRED'
  | 'SIGNAL_REVIEWED'

// Map from raw action_event types to canonical.
// DRAFTED != SENT: *_PREPARED events (a generated draft, or a proposal that was
// prepared but not submitted) never count as a send or an application. Only
// executed events do — the same rule Team Performance uses.
const ACTION_MAP: Record<string, CanonicalAction> = {
  'LEAD_EXTRACTED': 'LEAD_ANALYZED',
  'LEAD_SAVED': 'LEAD_SAVED',
  'CONNECTION_SENT': 'CONNECTION_SENT',
  'DM_SENT': 'FIRST_DM_SENT',
  // A first email is a real outbound message, the same canonical lane as a DM.
  'EMAIL_SENT': 'FIRST_DM_SENT',
  'FOLLOWUP_SENT': 'FOLLOWUP_SENT',
  'REPLY_SENT': 'REPLY_SENT',
  'UPWORK_APPLIED': 'UPWORK_APPLIED',
  'MEETING_BOOKED': 'MEETING_BOOKED',
  'CLIENT_WON': 'LEAD_WON',
  'OPPORTUNITY_CREATED': 'LEAD_SAVED',
  'LEAD_REFERRED': 'LEAD_REFERRED',
}

/** Raw event → canonical activity, or null when it is not executed work (drafts, failures, noise). */
export function canonicalActionFor(actionType: string, executionStatus?: string | null): CanonicalAction | null {
  if (executionStatus === 'failed') return null
  return ACTION_MAP[actionType] ?? null
}

export interface DailyActivity {
  date: string          // YYYY-MM-DD in local timezone
  totalActions: number
  weightedActivity: number
  active: boolean
  breakdown: {
    leadsAnalyzed: number
    leadsSaved: number
    connections: number
    firstDMs: number
    followups: number
    replies: number
    upworkApplications: number
    meetings: number
    wins: number
    referrals: number
  }
  events: Array<{
    id: string
    type: CanonicalAction
    occurredAt: string
    leadId: string | null
    leadCompany: string | null
    jobId: string | null
  }>
}

export interface ActivitySummary {
  activeDays: number
  totalDays: number
  currentStreak: number
  longestStreak: number
  totalActions: number
  averagePerActiveDay: number
  scheduledDaysRatio: number  // active scheduled days / scheduled days elapsed
  breakdown: DailyActivity['breakdown']
  streakHistory: Array<{ date: string; streak: number }>
}

export interface RepActivityResult {
  daily: DailyActivity[]
  summary: ActivitySummary
  rangeStart: string
  rangeEnd: string
  dataCoverageStart: string | null
}

/**
 * Get daily activity for one rep over a date range — or for the whole
 * organization when `repId` is null (the Admin team heatmap).
 *
 * Uses organization timezone for day boundaries.
 * 0 AI calls — one GROUP BY on action_events, or a raw read on the Supabase
 * rollback path (PostgREST has no raw-SQL surface).
 */
export async function getRepDailyActivity(params: {
  /** null = organization-wide aggregation. */
  repId: string | null
  orgId: string
  startDate: Date
  endDate: Date
  timezone?: string
  supabase: DbClient
  /**
   * The one day whose raw events the drilldown needs. Null — the default for
   * the page and both API routes — returns the heatmap with no events at all.
   */
  includeEventsForDate?: string | null
}): Promise<RepActivityResult> {
  const { repId, orgId, startDate, endDate, timezone = 'UTC', supabase, includeEventsForDate = null } = params

  const aggregated = await loadDailyCounts({ repId, orgId, startDate, endDate, timezone, supabase })
  if (aggregated) {
    const eventsByDay = includeEventsForDate
      ? await loadDayEvents({ repId, orgId, date: includeEventsForDate, timezone, supabase })
      : new Map<string, DailyActivity['events']>()
    return buildActivity({
      startDate,
      endDate,
      timezone,
      countsByDay: aggregated.counts,
      eventsByDay,
      dataCoverageStart: aggregated.coverageStart,
    })
  }

  // Fetch all action_events in the date range. Org-wide (repId null) omits the
  // actor predicate rather than matching NULL.
  let eventsQuery = supabase
    .from('action_events')
    .select('id, action_type, execution_status, actor_id, lead_id, job_id, occurred_at')
    .eq('organization_id', orgId)
    .gte('occurred_at', startDate.toISOString())
    .lt('occurred_at', endDate.toISOString())
    .order('occurred_at', { ascending: true })
  if (repId) eventsQuery = eventsQuery.eq('actor_id', repId)
  const { data: events, error } = await eventsQuery

  if (error || !events) {
    return emptyResult(startDate, endDate)
  }

  // Fetch lead names for drill-down — only the clicked day needs them.
  const leadNames = new Map<string, string>()
  if (includeEventsForDate && events.length > 0) {
    const leadIds = [...new Set(
      events
        .filter(e => toLocalDate(e.occurred_at, timezone) === includeEventsForDate)
        .map(e => e.lead_id)
        .filter(Boolean),
    )]
    if (leadIds.length > 0) {
      try {
        const leads = await chunkedIn<{ id: string; company: string | null }>(leadIds, (chunk) => supabase
          .from('leads')
          .select('id, company')
          .in('id', chunk))
        for (const l of leads) leadNames.set(l.id, l.company ?? 'Unknown')
      } catch { /* names are drill-down only */ }
    }
  }

  const countsByDay = new Map<string, DailyActivityCounts>()
  const eventsByDay = new Map<string, DailyActivity['events']>()

  for (const event of events) {
    const canonical = canonicalActionFor(event.action_type, event.execution_status)
    if (!canonical) continue // drafts, failures and non-activity types

    // Convert to local date
    const localDate = toLocalDate(event.occurred_at, timezone)
    if (!localDate) continue

    countsByDay.set(localDate, addDayCount(countsByDay.get(localDate) ?? emptyDayCounts(), canonical))

    if (localDate === includeEventsForDate) {
      const list = eventsByDay.get(localDate) ?? []
      list.push({
        id: event.id,
        type: canonical,
        occurredAt: event.occurred_at,
        leadId: event.lead_id ?? null,
        leadCompany: event.lead_id ? (leadNames.get(event.lead_id) ?? null) : null,
        jobId: event.job_id ?? null,
      })
      eventsByDay.set(localDate, list)
    }
  }

  return buildActivity({
    startDate,
    endDate,
    timezone,
    countsByDay,
    eventsByDay,
    dataCoverageStart: events.length > 0 ? events[0].occurred_at : null,
  })
}

interface DailyActivityCounts {
  totalActions: number
  weightedActivity: number
  breakdown: DailyActivity['breakdown']
}

function emptyBreakdown(): DailyActivity['breakdown'] {
  return {
    leadsAnalyzed: 0,
    leadsSaved: 0,
    connections: 0,
    firstDMs: 0,
    followups: 0,
    replies: 0,
    upworkApplications: 0,
    meetings: 0,
    wins: 0,
    referrals: 0,
  }
}

function emptyDayCounts(): DailyActivityCounts {
  return { totalActions: 0, weightedActivity: 0, breakdown: emptyBreakdown() }
}

function addDayCount(counts: DailyActivityCounts, action: CanonicalAction): DailyActivityCounts {
  return {
    totalActions: counts.totalActions + 1,
    weightedActivity: counts.weightedActivity + getActionWeight(action),
    breakdown: incrementBreakdown(counts.breakdown, action),
  }
}

function addDayCounts(counts: DailyActivityCounts, action: CanonicalAction, n: number): DailyActivityCounts {
  let out = counts
  for (let i = 0; i < n; i += 1) out = addDayCount(out, action)
  return out
}

interface DailyCountsResult {
  counts: Map<string, DailyActivityCounts>
  /** First raw event in the window, before any canonical filter. */
  coverageStart: string | null
}

/**
 * The Neon heatmap read: one row per (local day, action type). Returns null on
 * the Supabase path or when the aggregate fails, so the caller falls back to
 * reading events — a failed aggregate degrades to the old behaviour, never to
 * an empty heatmap.
 */
async function loadDailyCounts(params: {
  repId: string | null
  orgId: string
  startDate: Date
  endDate: Date
  timezone: string
  supabase: DbClient
}): Promise<DailyCountsResult | null> {
  const { repId, orgId, startDate, endDate, timezone, supabase } = params
  if (!supabase.raw) return null

  const daily = activityDailySql({ orgId, repId, start: startDate.toISOString(), end: endDate.toISOString(), timezone })
  const coverage = activityCoverageSql({ orgId, repId, start: startDate.toISOString(), end: endDate.toISOString() })
  const [dailyRes, coverageRes] = await Promise.all([
    supabase.raw<{ day: string; action_type: string; n: number }[]>(daily.sql, daily.params),
    supabase.raw<{ coverage_start: string | null }[]>(coverage.sql, coverage.params),
  ])
  if (dailyRes.error || !Array.isArray(dailyRes.data)) {
    console.error('[activity] daily aggregate failed:', dailyRes.error?.message)
    return null
  }

  const counts = new Map<string, DailyActivityCounts>()
  for (const row of dailyRes.data) {
    const canonical = canonicalActionFor(row.action_type, null)
    if (!canonical) continue
    const day = String(row.day)
    counts.set(day, addDayCounts(counts.get(day) ?? emptyDayCounts(), canonical, Number(row.n)))
  }
  return { counts, coverageStart: coverageRes.data?.[0]?.coverage_start ?? null }
}

/** The drilldown's raw events for one clicked day. */
async function loadDayEvents(params: {
  repId: string | null
  orgId: string
  date: string
  timezone: string
  supabase: DbClient
}): Promise<Map<string, DailyActivity['events']>> {
  const { repId, orgId, date, timezone, supabase } = params
  if (!isDateString(date)) return new Map()
  if (!supabase.raw) return new Map()
  const { start, end } = businessDateRange(date, timezone)
  const { sql, params: args } = activityDayEventsSql({ orgId, repId, start, end, timezone })
  const { data, error } = await supabase.raw<{
    id: string
    action_type: string
    execution_status: string | null
    lead_id: string | null
    job_id: string | null
    occurred_at: string
  }>(sql, args)
  if (error || !Array.isArray(data)) {
    console.error('[activity] day drilldown aggregate failed:', error?.message)
    return new Map()
  }

  const leadIds = [...new Set(data.map((e) => e.lead_id).filter(Boolean))] as string[]
  const leadNames = new Map<string, string>()
  if (leadIds.length > 0) {
    try {
      const leads = await chunkedIn<{ id: string; company: string | null }>(leadIds, (chunk) => supabase
        .from('leads')
        .select('id, company')
        .in('id', chunk))
      for (const l of leads) leadNames.set(l.id, l.company ?? 'Unknown')
    } catch { /* names are drill-down only */ }
  }

  const events: DailyActivity['events'] = []
  for (const row of data) {
    const canonical = canonicalActionFor(row.action_type, row.execution_status)
    if (!canonical) continue
    events.push({
      id: row.id,
      type: canonical,
      occurredAt: row.occurred_at,
      leadId: row.lead_id ?? null,
      leadCompany: row.lead_id ? (leadNames.get(row.lead_id) ?? null) : null,
      jobId: row.job_id ?? null,
    })
  }
  return new Map([[date, events]])
}

/** Fill the full date range and derive the summary from per-day counts. */
function buildActivity(params: {
  startDate: Date
  endDate: Date
  timezone: string
  countsByDay: Map<string, DailyActivityCounts>
  eventsByDay: Map<string, DailyActivity['events']>
  dataCoverageStart: string | null
}): RepActivityResult {
  const { startDate, endDate, timezone, countsByDay, eventsByDay, dataCoverageStart } = params

  // Build full date range (including empty days)
  const daily: DailyActivity[] = []
  const current = new Date(startDate)
  while (current <= endDate) {
    const dateStr = formatLocalDate(current, timezone)
    const counts = countsByDay.get(dateStr) ?? emptyDayCounts()
    daily.push({
      date: dateStr,
      totalActions: counts.totalActions,
      weightedActivity: counts.weightedActivity,
      active: counts.totalActions > 0,
      breakdown: counts.breakdown,
      events: eventsByDay.get(dateStr) ?? [],
    })
    current.setDate(current.getDate() + 1)
  }

  // Calculate summary
  const activeDays = daily.filter(d => d.active)
  const summary: ActivitySummary = {
    activeDays: activeDays.length,
    totalDays: daily.length,
    currentStreak: calculateCurrentStreak(daily, timezone),
    longestStreak: calculateLongestStreak(daily, timezone),
    totalActions: daily.reduce((sum, d) => sum + d.totalActions, 0),
    averagePerActiveDay: activeDays.length > 0
      ? Math.round(daily.reduce((sum, d) => sum + d.totalActions, 0) / activeDays.length)
      : 0,
    scheduledDaysRatio: 0, // Calculated separately from targets
    breakdown: {
      leadsAnalyzed: daily.reduce((s, d) => s + d.breakdown.leadsAnalyzed, 0),
      leadsSaved: daily.reduce((s, d) => s + d.breakdown.leadsSaved, 0),
      connections: daily.reduce((s, d) => s + d.breakdown.connections, 0),
      firstDMs: daily.reduce((s, d) => s + d.breakdown.firstDMs, 0),
      followups: daily.reduce((s, d) => s + d.breakdown.followups, 0),
      replies: daily.reduce((s, d) => s + d.breakdown.replies, 0),
      upworkApplications: daily.reduce((s, d) => s + d.breakdown.upworkApplications, 0),
      meetings: daily.reduce((s, d) => s + d.breakdown.meetings, 0),
      wins: daily.reduce((s, d) => s + d.breakdown.wins, 0),
      referrals: daily.reduce((s, d) => s + d.breakdown.referrals, 0),
    },
    streakHistory: [],
  }

  return {
    daily,
    summary,
    rangeStart: formatLocalDate(startDate, timezone),
    rangeEnd: formatLocalDate(endDate, timezone),
    dataCoverageStart,
  }
}

function incrementBreakdown(b: DailyActivity['breakdown'], action: CanonicalAction): DailyActivity['breakdown'] {
  switch (action) {
    case 'LEAD_ANALYZED': return { ...b, leadsAnalyzed: b.leadsAnalyzed + 1 }
    case 'LEAD_SAVED': return { ...b, leadsSaved: b.leadsSaved + 1 }
    case 'CONNECTION_SENT': return { ...b, connections: b.connections + 1 }
    case 'FIRST_DM_SENT': return { ...b, firstDMs: b.firstDMs + 1 }
    case 'FOLLOWUP_SENT': return { ...b, followups: b.followups + 1 }
    case 'REPLY_SENT': return { ...b, replies: b.replies + 1 }
    case 'UPWORK_APPLIED': return { ...b, upworkApplications: b.upworkApplications + 1 }
    case 'MEETING_BOOKED': return { ...b, meetings: b.meetings + 1 }
    case 'LEAD_WON': return { ...b, wins: b.wins + 1 }
    case 'LEAD_REFERRED': return { ...b, referrals: b.referrals + 1 }
    default: return b
  }
}

function getActionWeight(action: CanonicalAction): number {
  // Visual weight for heatmap — NOT business value
  switch (action) {
    case 'LEAD_ANALYZED': return 1
    case 'LEAD_SAVED': return 1
    case 'CONNECTION_SENT': return 2
    case 'FIRST_DM_SENT': return 2
    case 'FOLLOWUP_SENT': return 1
    case 'REPLY_SENT': return 2
    case 'UPWORK_APPLIED': return 3
    case 'MEETING_BOOKED': return 4
    case 'LEAD_WON': return 5
    case 'LEAD_REFERRED': return 1
    default: return 1
  }
}

function calculateCurrentStreak(daily: DailyActivity[], timezone: string): number {
  let streak = 0
  const today = formatLocalDate(new Date(), timezone)

  // Find today or most recent day
  let i = daily.length - 1
  while (i >= 0) {
    const day = daily[i]
    const isWorkday = isExpectedWorkday(day.date, timezone)

    if (day.active) {
      streak++
    } else if (isWorkday) {
      // Missed a workday — streak broken
      break
    }
    // Non-workday with no activity doesn't break streak
    i--
  }

  return streak
}

function calculateLongestStreak(daily: DailyActivity[], timezone: string): number {
  let maxStreak = 0
  let currentStreak = 0

  for (const day of daily) {
    const isWorkday = isExpectedWorkday(day.date, timezone)
    if (day.active) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else if (isWorkday) {
      currentStreak = 0
    }
  }

  return maxStreak
}

function isExpectedWorkday(dateStr: string, timezone: string): boolean {
  const date = new Date(dateStr + 'T12:00:00' + getOffset(timezone))
  const day = date.getDay()
  return day >= 1 && day <= 5 // Mon-Fri
}

function toLocalDate(isoTimestamp: string, timezone: string): string | null {
  try {
    const date = new Date(isoTimestamp)
    // Use Intl to convert to local date parts
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)

    const year = parts.find(p => p.type === 'year')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const day = parts.find(p => p.type === 'day')?.value
    if (!year || !month || !day) return null
    return `${year}-${month}-${day}`
  } catch {
    return null
  }
}

function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function getOffset(timezone: string): string {
  // Simple offset calculation for date construction
  const now = new Date()
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = now.toLocaleString('en-US', { timeZone: timezone })
  const diff = (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / (1000 * 60 * 60)
  const sign = diff >= 0 ? '+' : '-'
  const hours = Math.floor(Math.abs(diff))
  return `${sign}${String(hours).padStart(2, '0')}:00`
}

export interface ActivityTrendSeries {
  /** A breakdown key, or 'tasks' for the assigned-task truth. */
  key: keyof DailyActivity['breakdown'] | 'tasks'
  label: string
}

export interface ActivityTrendPoint {
  date: string
  [seriesKey: string]: number | string
}

/**
 * One point per day for a dashboard trend chart. Task completions come from
 * their own aggregate (assigned_tasks) because they are not action_events;
 * every other series is a canonical activity breakdown key, so the trend and
 * the heatmap are guaranteed to read the same underlying work.
 */
export function buildActivityTrendPoints(
  daily: ReadonlyArray<DailyActivity>,
  tasksByDay: ReadonlyMap<string, number> | null,
  series: ReadonlyArray<ActivityTrendSeries>,
): ActivityTrendPoint[] {
  return daily.map((day) => {
    const point: ActivityTrendPoint = { date: day.date }
    for (const s of series) {
      point[s.key] =
        s.key === 'tasks' ? (tasksByDay?.get(day.date) ?? 0) : day.breakdown[s.key]
    }
    return point
  })
}

function emptyResult(startDate: Date, endDate: Date): RepActivityResult {
  return {
    daily: [],
    summary: {
      activeDays: 0,
      totalDays: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalActions: 0,
      averagePerActiveDay: 0,
      scheduledDaysRatio: 0,
      breakdown: {
        leadsAnalyzed: 0, leadsSaved: 0, connections: 0, firstDMs: 0,
        followups: 0, replies: 0, upworkApplications: 0, meetings: 0,
        wins: 0, referrals: 0,
      },
      streakHistory: [],
    },
    rangeStart: startDate.toISOString().slice(0, 10),
    rangeEnd: endDate.toISOString().slice(0, 10),
    dataCoverageStart: null,
  }
}
