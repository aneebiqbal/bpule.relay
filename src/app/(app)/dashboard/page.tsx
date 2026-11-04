import { createServerSupabase } from '@/lib/supabase/server'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue } from '@/lib/relay/queue-engine'
import { rankNextActions, type NextBestAction } from '@/lib/relay/next-best-action'
import { deriveTodayCounts } from '@/lib/relay/today-counts'
import { logRecommendation } from '@/lib/action-ledger'
import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import type { RelayTaskKind } from '@/lib/domain/types'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'
import { V4RepHome } from '@/components/v4/v4-rep-home'
import { V4ManagerHome } from '@/components/v4/v4-manager-home'
import { V4AdminHome } from '@/components/v4/v4-admin-home'
import { loadManagerHomeTeam } from '@/lib/team/load-manager-home'
import { loadAdminCommandCenter } from '@/lib/team/load-admin-command-center'
import { qualifyCanonicalScore, displayScoreForCanonical } from '@/lib/scoring/qualification'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'
import {
  filterActionsByWorkspace,
  filterLeadsByWorkspace,
  sliceTargetSummaryForWorkspace,
  sumTargets,
} from '@/lib/rep-home/profile-scope'
import { actionDeepLink } from '@/lib/rep-home/action-presentation'
import { REP_V3_ACTIVITY_LIMIT } from '@/lib/rep-home/v3-present'
import { loadTimeline } from '@/lib/operations/activity'
import type { OpenLeadFact } from '@/lib/team/admin-command-summary'
import { businessDateRange, currentInstant, orgDate, addDays, isOrgWorkingDay, weekdayOfDate } from '@/lib/org-clock'
import type { OperatingPolicy } from '@/lib/org-clock'
import { getRepDailyActivity, buildActivityTrendPoints, type DailyActivity } from '@/lib/performance/activity-model'
import { teamTasksTrendSql } from '@/lib/analytics/aggregates'
import { REP_TREND_SERIES } from '@/lib/rep-home/v3-present'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { perfTrace } from '@/lib/perf-trace'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const user = await perfTrace('auth:getCurrentUser', () => getCurrentUser())
  if (!user) redirect('/login')
  const authCtx = await perfTrace('auth:getAuthContext', () => getAuthContext())
  if (!authCtx) redirect('/login')

  if (authCtx.isOwner || authCtx.isAdmin) {
    // Org Command Center — no analytics fan-out on first paint (Reports owns charts).
    const adminResult = await perfTrace('admin:loadAdminCommandCenter', () => loadAdminCommandCenter())
    return (
      <Suspense fallback={<DashboardShellSkeleton />}>
        <V4AdminHome
          data={adminResult.data}
          adminName={user.rep.name}
          error={adminResult.error}
        />
      </Suspense>
    )
  }

  if (authCtx.isManager && authCtx.managedTeamIds.length > 0) {
    // Personal work is profile-scoped; team payload is managed-team scope —
    // never filter team metrics by the manager's active sending profile.
    const [repData, teamResult] = await Promise.all([
      loadRepWorkspaceData(user.rep.id),
      loadManagerHomeTeam(),
    ])

    return (
      <Suspense fallback={<DashboardShellSkeleton />}>
        <V4ManagerHome
          personal={repData}
          team={teamResult.data}
          error={teamResult.error}
        />
      </Suspense>
    )
  }

  const repData = await loadRepWorkspaceData(user.rep.id)

  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <V4RepHome data={repData} role={user.rep.role} />
    </Suspense>
  )
}


async function loadRepWorkspaceData(repId: string): Promise<RepWorkspaceData> {
  const user = await getCurrentUser()
  if (!user || user.rep.id !== repId) {
    throw new Error('Not signed in')
  }

  const store = await perfTrace('rep:createScoutStore', () => createScoutStore())
  // Read-only composition: collapse the repeated lead-list reads described below.
  store.beginReadOnlySnapshot()

  const { getDailyWorkspace } = await import('@/lib/auth/workspace')
  // Workspace resolution and the dashboard batch are independent; running them
  // serially added the full workspace cost on top of the batch every request.
  // `getDailyWorkspace` is request-cached, so `loadRepDay` still shares it.
  const [workspaceResult, dashboardResult] = await Promise.all([
    perfTrace('rep:workspace', () => Promise.all([
      perfTrace('rep:getDailyWorkspace', () => getDailyWorkspace()),
      perfTrace('rep:resolveActiveWorkspace', () => resolveActiveWorkspace()),
    ])),
    perfTrace('rep:dashboard-batch', () => Promise.all([
      perfTrace('rep:getTodayDashboard', () => store.getTodayDashboard()),
      // Optional sections must not take the page down: an empty queue still
      // renders header, metrics and pipeline pulse.
      perfTrace('rep:getRelayQueueData', () =>
        store.getRelayQueueData().catch(() => ({
          conversations: new Map(),
          messagesByLead: new Map(),
          messagesByJob: new Map(),
          assignedProfiles: [],
        })),
      ),
      // The canonical rep day. `getDailyWorkspace` is request-cached, so this
      // shares the same identities/targets/accountability load as `workspace`.
      perfTrace('rep:loadRepDay', () => import('@/lib/rep-day/load').then((m) => m.loadRepDay())),
    ])),
  ])
  const [workspace, activeWorkspace] = workspaceResult
  const [dash, relayData, repDay] = dashboardResult

  const scopedLeads = filterLeadsByWorkspace(dash.mine?.queue ?? [], activeWorkspace)
  const scopedFollowups = dash.followupsDue.filter((row) =>
    filterLeadsByWorkspace([row.lead], activeWorkspace).length > 0,
  )
  const leadsById = new Map(scopedLeads.map((lead) => [lead.id, lead]))

  const roleContext = buildRoleContext(user.rep, user.organization)
  const queue = buildRelayQueue({
    roleContext,
    queueData: dash.mine ? { ...dash.mine, queue: scopedLeads } : dash.mine,
    followupsDue: scopedFollowups,
    upwork: dash.upwork,
    conversations: relayData.conversations,
    messagesByLead: relayData.messagesByLead,
    messagesByJob: relayData.messagesByJob,
    assignedProfiles: relayData.assignedProfiles,
    allReps: undefined,
    allLeads: [],
    suppressedLeadIds: await perfTrace('rep:suppressedLeadIds', () =>
      store.getSuppressedLeadIds().catch(() => new Set<string>())),
  })

  const { filterQueueByRole } = await import('@/lib/relay/queue-engine')
  const visibleTasks = filterQueueByRole(queue, roleContext.role)

  const profilesPulled = await perfTrace('rep:countProfilesPulled', () =>
    countProfilesPulled(user.organization.id, user.rep.id).catch(() => 0))
  const [referredLeads, recentLeads, allUpworkJobs, activityRows] = await perfTrace('rep:secondary-batch', () => Promise.all([
    store.getReferredLeads(user.rep.id),
    store.getRecentLeads(user.rep.id, 5),
    store.listUpworkJobs().catch(() => []),
    // Canonical operational timeline — same authority as the Activity Center.
    // The demo store has no direct client, so this stays optional there.
    (async () => {
      try {
        return await loadTimeline(store.getSupabaseClient(), {
          orgId: user.organization.id,
          repIds: [user.rep.id],
          limit: REP_V3_ACTIVITY_LIMIT,
        })
      } catch {
        return []
      }
    })(),
  ]))
  const upworkJobs = allUpworkJobs
    .filter((j) => j.verdict === 'apply' && j.status !== 'applied')
    .slice(0, 3)
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.clientName ?? j.tags[0] ?? 'Client',
      canonicalScore: j.score,
      fitScore: j.score,
    }))

  const identityRows = sliceTargetSummaryForWorkspace(workspace.targetSummary.byIdentity, activeWorkspace)
  const scopedTargets = sumTargets(identityRows)
  const totalTarget = scopedTargets.totalTarget
  const totalRemaining = scopedTargets.totalRemaining
  const completionDone = scopedTargets.totalCompleted

  // Derive resume work: leads with drafts started but not yet sent
  const resumeWork = recentLeads
    .filter((l) => {
      const hasDraft = (l as any).messages?.some((m: any) => m.draftText && !m.sentText)
      const isTerminal = l.status === 'won' || l.status === 'lost' || l.status === 'dead'
      return hasDraft && !isTerminal
    })
    .slice(0, 3)
    .map((l) => ({
      id: l.id,
      company: l.company,
      contactName: (l as any).contactName ?? null,
      lastAction: (l as any).messages?.find((m: any) => m.draftText && !m.sentText)?.type ?? 'draft',
      state: (l as any).status === 'new' ? 'Draft started' : 'In progress',
    }))

  // Canonical ranking via next-best-action.ts — single source of truth
  // Use role-filtered queue so reps don't see admin tasks
  const filteredQueue: typeof queue = {
    ...queue,
    tasks: visibleTasks,
    summary: {
      total: visibleTasks.length,
      urgent: visibleTasks.filter(t => t.priority === 'urgent').length,
      byKind: queue.summary.byKind,
    },
  }
  const rankedActions = rankNextActions({
    queue: filteredQueue,
    leads: scopedLeads,
    messagesByLead: relayData.messagesByLead,
  })

  // Apply live conversation override — active conversations supersede cold prospect score
  const { evaluateLiveOpportunity } = await import('@/lib/relay/live-opportunity')
  // The full canonical action list. The Today KPI card and the section lists both
  // read this, so they cannot disagree (REL-QA-003/004).
  const allActionsRaw: RelayTodayAction[] = rankedActions.map((nba) => {
    const action = nbaToRelayAction(nbaToActionKind, workspace, activeWorkspace)(nba)

    // Check if this lead has an active live conversation that should override
    const leadId = action.id.replace(/^(reply-|followup-|highfit-|opportunity-|connection-dm-)/, '')
    const messages = (relayData.messagesByLead.get(leadId) ?? []).map((m: {
      direction?: 'inbound' | 'outbound' | null
      sentText?: string | null
      sentAt?: string | null
    }) => ({
      direction: m.direction ?? 'outbound',
      sentText: m.sentText,
      sentAt: m.sentAt,
    }))
    const lead = scopedLeads.find(l => l.id === leadId)

    if (lead && messages.length > 0) {
      const liveState = evaluateLiveOpportunity({
        leadId,
        messages,
        initialAction: action.humanAction,
        initialScore: lead.canonicalScore ?? lead.score ?? 0,
      })

      if (liveState.supersedesInitialScore && liveState.liveAction === 'REPLY_NOW') {
        action.priority = 'urgent'
        action.humanAction = 'REPLY_NOW'
        action.whatHappened = liveState.reason
      }
    }

    return action
  })

  const allActions = filterActionsByWorkspace(allActionsRaw, leadsById, activeWorkspace).map((action) => ({
    ...action,
    href: actionDeepLink(action),
  }))
  const actions = allActions.slice(0, 10)
  const todayCounts = deriveTodayCounts(allActions)

  const authCtx = await perfTrace('rep:getAuthContext', () => getAuthContext())
  let unifiedTasks: import('@/lib/tasks/types').UnifiedTask[] = []
  if (authCtx) {
    const { loadUnifiedTasks } = await import('@/lib/tasks/load-unified-tasks')
    unifiedTasks = await perfTrace('rep:unifiedTasks', () =>
      loadUnifiedTasks({
        auth: authCtx,
        derivedActions: allActions,
        forRepId: user.rep.id,
        includeCompleted: false,
      }).catch(() => []),
    )
  }

  // Canonical meetings / wins today (src/lib/sales/meetings.ts) — same events
  // Manager Home, Admin Home, Rep 360 and Team Performance count.
  const outcomeEvents = user.organization?.id
    ? await perfTrace('rep:outcomeEventsToday', () =>
        countOutcomeEventsToday(user.organization.id, user.rep.id).catch(() => null))
    : null

  // Dashboard visuals. Each optional read degrades on its own — a failed
  // heatmap or trend never takes metrics, attention or the action list down.
  let activityDaily: DailyActivity[] | null = null
  let tasksTrend: Map<string, number> | null = null
  let tasksCompletedToday: number | null = null
  let targetWindows: RepWorkspaceData['targetWindows'] = null
  if (user.organization?.id) {
    const policy = await perfTrace('rep:operatingPolicy', () =>
      loadOperatingPolicy(user.organization.id).catch(() => null))
    if (policy) {
      const businessDate = orgDate(currentInstant(), policy.timezone)
      const dayRange = businessDateRange(businessDate, policy.timezone)
      const trendStart = businessDateRange(addDays(businessDate, -29), policy.timezone).start
      const [daily, tasksByDay] = await perfTrace('rep:visual-batch', () => Promise.all([
        perfTrace('rep:activityDaily', () =>
          loadRepActivityDaily(user.organization.id, user.rep.id, businessDate, policy.timezone).catch(() => null)),
        perfTrace('rep:tasksTrend', () =>
          loadRepTasksTrend(user.organization.id, [user.rep.id], trendStart, dayRange.end, policy.timezone).catch(() => null)),
      ]))
      activityDaily = daily
      tasksTrend = tasksByDay
      tasksCompletedToday = tasksByDay ? (tasksByDay.get(businessDate) ?? 0) : null
      targetWindows = await perfTrace('rep:targetWindows', () =>
        loadRepTargetWindows({
          orgId: user.organization.id,
          repId: user.rep.id,
          dailyDone: completionDone,
          dailyTarget: totalTarget,
          businessDate,
          policy,
        }).catch(() => null))
    }
  }

  // Log recommendations for observability (non-blocking)
  if (actions.length > 0 && user.organization?.id) {
    Promise.all(actions.slice(0, 5).map(action =>
      logRecommendation({
        orgId: user.organization.id,
        repId: user.rep.id,
        leadId: action.id.startsWith('reply-') || action.id.startsWith('followup-') ? action.id.replace(/^(reply-|followup-|highfit-|opportunity-|connection-dm-)/, '') : null,
        action: action.humanAction,
        priority: action.priority === 'urgent' ? 90 : action.priority === 'high' ? 70 : action.priority === 'medium' ? 50 : 30,
        reason: action.whatHappened,
      })
    )).catch(() => { /* observability failure is non-fatal */ })
  }

  const pipelineLeads: OpenLeadFact[] = scopedLeads.map((lead) => ({
    id: lead.id,
    company: lead.company,
    status: lead.status,
    ownerRepId: lead.ownerRepId,
    ownerName: null,
    revenueIdentityId: lead.revenueIdentityId ?? null,
    canonicalScore: lead.canonicalScore ?? null,
    updatedAt: lead.createdAt ?? null,
    lastOutboundAt: null,
  }))

  return {
    rep: workspace.rep,
    activeWorkspace: activeWorkspace
      ? {
          id: activeWorkspace.id,
          identityName: activeWorkspace.identityName,
          title: activeWorkspace.title,
          channel: activeWorkspace.channel,
        }
      : null,
    repDay,
    isWorkingDay: workspace.isWorkingDay,
    hasAssignments: workspace.hasAssignments,
    identities: identityRows,
    targetSummary: {
      ...workspace.targetSummary,
      totalTarget: scopedTargets.totalTarget,
      totalCompleted: scopedTargets.totalCompleted,
      totalRemaining: scopedTargets.totalRemaining,
      byIdentity: identityRows,
    },
    day: {
      ...workspace.day,
      repliesWaiting: todayCounts.repliesWaiting,
      followUpsDue: todayCounts.followUpsDue,
      totalRemaining: workspace.targetSummary.totalRemaining + todayCounts.repliesWaiting + todayCounts.followUpsDue,
      isComplete: workspace.targetSummary.totalRemaining === 0 && todayCounts.repliesWaiting === 0 && todayCounts.followUpsDue === 0,
    },
    allActions,
    unifiedTasks,
    outcomeEvents,
    nextAction: actions[0] ?? null,
    upNext: actions.slice(1),
    notifications: [],
    profilesPulled,
    referredLeads: referredLeads.map(l => ({
      id: l.id,
      company: l.company,
      score: l.score,
      canonicalScore: l.canonicalScore ?? null,
      displayQualification: l.displayQualification ?? null,
      displayIntelligenceVersion: l.displayIntelligenceVersion ?? null,
      referredAt: l.referralAt ?? null,
    })),
    recentLeads: recentLeads.map(l => ({
      id: l.id,
      company: l.company,
      score: l.score,
      canonicalScore: l.canonicalScore ?? null,
      displayQualification: l.displayQualification ?? null,
      displayIntelligenceVersion: l.displayIntelligenceVersion ?? null,
      createdAt: l.createdAt,
    })),
    upworkJobs,
    completion: { done: completionDone, remaining: totalRemaining },
    resumeWork: resumeWork.map(r => ({
      id: r.id,
      company: r.company,
      contactName: r.contactName,
      lastAction: r.lastAction,
      state: r.state,
    })),
    signalFeed: buildSignalFeedFromActionEvents(dash, recentLeads),
    activity: activityRows,
    activityDaily,
    tasksCompletedToday,
    targetWindows,
    trendPoints:
      activityDaily && tasksTrend
        ? buildActivityTrendPoints(activityDaily, tasksTrend, REP_TREND_SERIES)
        : null,
    pipelineLeads,
  }
}

/**
 * Today's executed events for this rep, counted with the same rule as Team
 * Performance, Admin Home and Reports (aggregateMetrics): drafts, generated
 * copy and failed sends never count; meetings / wins are outcome events.
 */
async function countOutcomeEventsToday(orgId: string, repId: string): Promise<RepWorkspaceData['outcomeEvents']> {
  try {
    const supabase = await createServerSupabase()
    const policy = await loadOperatingPolicy(orgId)
    const businessDate = orgDate(currentInstant(), policy.timezone)
    const { start, end } = businessDateRange(businessDate, policy.timezone)
    const { aggregateMetrics, PERFORMANCE_ACTION_TYPES } = await import('@/lib/operations/performance')
    const { data, error } = await supabase
      .from('action_events')
      .select('actor_id, action_type, execution_status, lead_id')
      .eq('organization_id', orgId)
      .eq('actor_id', repId)
      .in('action_type', PERFORMANCE_ACTION_TYPES)
      .gte('occurred_at', start)
      .lt('occurred_at', end)
      .limit(2000)
    if (error) return null
    const m = aggregateMetrics(data ?? [])
    return { meetings: m.meetings, wins: m.wins, connections: m.connections, repliesSent: m.repliesSent, proposals: m.proposals }
  } catch {
    return null
  }
}

async function countProfilesPulled(orgId: string, repId: string): Promise<number> {
  try {
    const supabase = await createServerSupabase()
    // Operating policy timezone is the only authority for the business day.
    const policy = await loadOperatingPolicy(orgId)
    const businessDate = orgDate(currentInstant(), policy.timezone)
    const { start, end } = businessDateRange(businessDate, policy.timezone)
    const { count } = await supabase
      .from('extraction_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('rep_id', repId)
      .gte('created_at', start)
      .lt('created_at', end)
    return count ?? 0
  } catch {
    return 0
  }
}

const ACTIVITY_WEEKS = 12
const ACTIVITY_DAYS = ACTIVITY_WEEKS * 7

/**
 * Twelve weeks of canonical daily activity for the Rep heatmap and trend.
 * One grouped aggregate per load; the day drilldown is never requested here.
 */
async function loadRepActivityDaily(
  orgId: string,
  repId: string,
  businessDate: string,
  timezone: string,
): Promise<DailyActivity[]> {
  const start = businessDateRange(addDays(businessDate, -(ACTIVITY_DAYS - 1)), timezone).start
  const end = businessDateRange(businessDate, timezone).end
  const supabase = await createServerSupabase()
  const result = await getRepDailyActivity({
    repId,
    orgId,
    startDate: new Date(start),
    endDate: new Date(end),
    timezone,
    supabase,
  })
  return result.daily
}

/** Assigned-task completions per day — one aggregate, reused by the trend. */
async function loadRepTasksTrend(
  orgId: string,
  repIds: string[],
  start: string,
  end: string,
  timezone: string,
): Promise<Map<string, number>> {
  const supabase = await createServerSupabase()
  if (supabase.provider !== 'neon' || !supabase.raw) return new Map()
  const { sql, params } = teamTasksTrendSql({ orgId, repIds, start, end, timezone })
  const res = await supabase.raw<{ day: string; tasks: number }[]>(sql, params)
  if (res.error || !Array.isArray(res.data)) return new Map()
  return new Map(res.data.map((row) => [String(row.day), Number(row.tasks)]))
}

/**
 * Target windows for the Rep progress visual. Only the daily goal is stored;
 * weekly and monthly goals are the daily target × elapsed working days and are
 * labelled as derived in the UI.
 */
async function loadRepTargetWindows(args: {
  orgId: string
  repId: string
  dailyDone: number
  dailyTarget: number
  businessDate: string
  policy: OperatingPolicy
}): Promise<NonNullable<RepWorkspaceData['targetWindows']>> {
  const weekStart = startOfBusinessWeek(args.businessDate)
  const monthStart = `${args.businessDate.slice(0, 8)}01`
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('daily_accountability')
    .select('completed_count, target_date')
    .eq('organization_id', args.orgId)
    .eq('rep_id', args.repId)
    .gte('target_date', monthStart)
    .lte('target_date', args.businessDate)
    .limit(500)

  let weeklyDone: number | null = null
  let monthlyDone: number | null = null
  if (data && data.length > 0) {
    weeklyDone = 0
    monthlyDone = 0
    for (const row of data) {
      const n = Number((row.completed_count as number | null) ?? 0)
      monthlyDone += n
      if ((row.target_date as string) >= weekStart) weeklyDone += n
    }
  }

  return {
    dailyDone: args.dailyDone,
    dailyTarget: args.dailyTarget,
    weeklyDone,
    weeklyWorkingDays: workingDaysBetween(weekStart, args.businessDate, args.policy),
    monthlyDone,
    monthlyWorkingDays: workingDaysBetween(monthStart, args.businessDate, args.policy),
  }
}

function startOfBusinessWeek(date: string): string {
  const weekday = weekdayOfDate(date) // 0 = Sunday
  return addDays(date, weekday === 0 ? -6 : -(weekday - 1))
}

function workingDaysBetween(start: string, end: string, policy: OperatingPolicy): number {
  let count = 0
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    if (isOrgWorkingDay(policy, cursor)) count++
  }
  return count
}

/**
 * Maps canonical NextBestAction to RelayTaskKind for UI compatibility.
 * Preserves existing kind values that BdDailyDesk / DoThisNext / UpNext expect.
 */
function nbaToActionKind(action: NextBestAction['action']): RelayTaskKind {
  switch (action) {
    case 'REPLY_NOW': return 'reply_needed'
    case 'SEND_CONNECTION': return 'connection_dm_due'
    case 'SEND_FIRST_DM': return 'connection_dm_due'
    case 'SEND_FOLLOWUP': return 'followup_due'
    case 'RESEARCH': return 'high_fit_lead'
    case 'REVIEW_REFERRAL': return 'admin_review'
    case 'APPLY_UPWORK': return 'job_worth_apply'
    case 'RESUME_DRAFT': return 'proposal_ready'
    case 'WAIT': return 'lead_going_cold'
    default: return 'new_opportunity'
  }
}

/**
 * Maps a NextBestAction to the RelayTodayAction format consumed by BdDailyDesk.
 * No new state model — pure presentation mapping over canonical ranking.
 */
function nbaToRelayAction(
  toKind: typeof nbaToActionKind,
  workspace: { identities: Array<{ identityName: string; title: string | null; channel: string | null }> },
  activeWorkspace: { identityName: string; title: string | null; channel: string } | null,
) {
  return (nba: NextBestAction): RelayTodayAction => ({
    id: nba.leadId ?? nba.jobId ?? 'unknown',
    kind: toKind(nba.action),
    priority: nba.priority >= 80 ? 'urgent' as const : nba.priority >= 60 ? 'high' as const : nba.priority >= 40 ? 'medium' as const : 'low' as const,
    title: nba.title,
    subtitle: nba.subtitle,
    href: nba.leadId ? `/leads/${nba.leadId}` : nba.jobId ? `/upwork/${nba.jobId}` : '/dashboard',
    whatHappened: nba.reason,
    whyItMatters: nba.reason,
    whyLines: [nba.reason],
    prepared: null,
    humanAction: nba.action,
    createdAt: nba.dueAt ?? new Date().toISOString(),
    fitScore: null,
    identity: {
      id: null,
      name: activeWorkspace?.identityName ?? workspace.identities[0]?.identityName ?? '',
      title: activeWorkspace?.title ?? workspace.identities[0]?.title ?? null,
      channel: activeWorkspace?.channel ?? workspace.identities[0]?.channel ?? null,
    },
    proof: null,
    inbound: nba.channel === 'INBOUND',
  })
}

/**
 * Build signal feed items from recent leads with high scores.
 * Uses stored intelligence to surface meaningful changes.
 */
function buildSignalFeedFromActionEvents(
  dash: { followupsDue: { lead: { id: string; company: string; contactName?: string | null; canonicalScore?: number | null } }[] },
  recentLeads: Array<{ id: string; company: string; canonicalScore?: number | null; createdAt: string }>,
) {
  // The canonical band decides what "high-value" means; the label is the
  // band's own label, never a local threshold.
  const items = recentLeads
    .filter((l) => l.canonicalScore != null && ['STRONG', 'WORTH_PURSUING'].includes(qualifyCanonicalScore(l.canonicalScore).qualification))
    .slice(0, 3)
    .map((l, i) => {
      const band = qualifyCanonicalScore(l.canonicalScore ?? 0)
      return {
        id: `feed-${l.id}`,
        leadId: l.id,
        company: l.company,
        contactName: null,
        title: `${band.label} (${displayScoreForCanonical(l.canonicalScore ?? 0)}/10)`,
        detail: `Canonical ${l.canonicalScore}/100 — ${band.label.toLowerCase()}`,
        severity: 'notable' as const,
        type: 'OTHER_VERIFIED_EVENT' as const,
        createdAt: l.createdAt,
        rankScore: (l.canonicalScore ?? 0) * (1 - i * 0.1),
        cta: 'Review',
      }
    })
  return items
}

function DashboardShellSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your Relay / Today</p>
        <div className="h-8 w-72 max-w-full rounded bg-bone" />
        <div className="h-3.5 w-64 max-w-full rounded bg-bone" />
      </header>
      <div className="srf-console srf-console-edge hero-console-pulse overflow-hidden p-5 sm:p-6">
        <div className="h-3 w-16 rounded bg-bone" />
        <div className="mt-4 h-7 w-80 max-w-full rounded bg-bone" />
        <div className="mt-2 h-3.5 w-64 max-w-full rounded bg-bone" />
        <div className="mt-4 h-24 w-full rounded bg-bone" />
      </div>
      <section className="space-y-3">
        <div className="h-3 w-24 rounded bg-bone" />
        <div className="overflow-hidden rounded border border-line bg-bone-raised">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line/70 px-3 py-3 last:border-b-0">
              <span className="w-7 text-mono-medium text-[11px] text-stone">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-40 max-w-full rounded bg-bone" />
                <div className="h-3 w-56 max-w-full rounded bg-bone" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
