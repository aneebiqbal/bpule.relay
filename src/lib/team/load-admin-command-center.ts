import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/organization'
import { getCurrentUser } from '@/lib/auth/current'
import { loadTeamDay } from '@/lib/rep-day/team'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { addDays, businessDateRange, currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { activityLabelForAction, filterTeamLiveToRepIds } from '@/lib/team/manager-home-summary'
import {
  assembleAdminCommandCenter,
  emptyMovement,
  emptyYesterday,
  type AdminCommandCenterData,
  type AdminMovement,
  type AdminProfileExecutionRow,
  type AdminYesterday,
  type OpenLeadFact,
  type ProfilePerformanceRow,
} from '@/lib/team/admin-command-summary'
import { buildTeamProfiles } from '@/lib/team/profiles'
import { profileCompletionStatus } from '@/lib/rep-home/profile-completion'
import { qualifyCanonicalScore } from '@/lib/scoring/qualification'
import type { ManagerActivityItem } from '@/lib/team/manager-home-summary'
import {
  countOverdueAssignedByRep,
  countUnassignedOpenTasks,
  countWaitingAndTransferTasks,
  listUnreadTaskCommentCounts,
} from '@/lib/tasks/assigned-tasks'
import { loadOutcomeEventCounts } from '@/lib/operations/outcome-events'
import { normalizeChannel } from '@/lib/profiles/assigned-profiles'
import { groupMetrics, identityResolver, PERFORMANCE_ACTION_TYPES, type PerfEvent } from '@/lib/operations/performance'
import { getInboxCountsForOrg } from '@/lib/operations/inbox-counts'
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { taskCompletionCountsSql } from '@/lib/analytics/aggregates'
import { buildAdminExecutionByRep } from '@/lib/admin/v3-command-present'
import { perfTrace } from '@/lib/perf-trace'

const MEANINGFUL_ACTIONS = [
  'REPLY_SENT',
  'MEETING_BOOKED',
  'UPWORK_APPLIED',
  'UPWORK_PROPOSAL_PREPARED',
  'CLIENT_WON',
  'LEAD_LOST',
  'CLIENT_LOST',
  'LEAD_REFERRED',
] as const

const OPEN_STATUSES = ['new', 'contacted', 'followed_up', 'replied', 'meeting', 'proposal', 'won']

function emptyAdmin(orgName: string, isOwner: boolean): AdminCommandCenterData {
  return {
    orgName,
    isOwner,
    health: {
      activeOpportunities: 0,
      repliesWaiting: 0,
      repliesCritical: 0,
      followUpsOverdue: 0,
      overdueTasks: 0,
      waitingTasks: 0,
      transferRequests: 0,
      unreadTaskUpdates: 0,
      meetingsThisWeek: 0,
      wins: 0,
    },
    attention: [],
    team: {
      teamName: orgName,
      memberCount: 0,
      needsAttentionCount: 0,
      metrics: {
        repliesWaiting: 0,
        followUpsOverdue: 0,
        highPriority: 0,
        completedToday: 0,
        meetings: 0,
        wins: 0,
      },
      attention: [],
      rows: [],
      activity: [],
      scopeNote: 'managed_team',
    },
    rows: [],
    pipeline: [],
    stuck: [],
    profiles: [],
    activity: [],
    teamDay: {
      businessDate: '',
      timezone: 'UTC',
      isWorkingDay: false,
      workdayProgress: 0,
      minutesRemaining: 0,
      workdayStart: '09:00',
      workdayEnd: '18:00',
      counts: { NOT_STARTED: 0, ACTIVE: 0, AT_RISK: 0, CRITICAL: 0, READY_TO_CLOSE: 0, CLOSED: 0, MISSED: 0 },
      totals: { reps: 0, requiredRemaining: 0, commitmentProgress: 0, repliesWaiting: 0, actionsToday: 0, pipelineCreated: 0 },
      reps: [],
    },
    teamTarget: 0,
    teamCompleted: 0,
    profileExecution: [],
    movement: emptyMovement(),
    yesterday: emptyYesterday(),
    scopeNote: 'organization',
  }
}

/**
 * Admin / Owner Command Center — org-wide, batched.
 *
 * Wave 1: auth (caller)
 * Wave 2 parallel: teamDay, teamLive, open leads, identities, accountability,
 *   messages (week), activity
 *
 * Team metrics are organization-scoped. Personal active profile is NOT applied.
 */
export async function loadAdminCommandCenter(): Promise<{
  data: AdminCommandCenterData
  error?: boolean
}> {
  const [ctx, user] = await perfTrace('admin:auth', () => Promise.all([getAuthContext(), getCurrentUser()]))
  const orgName = user?.organization.name ?? 'Organization'
  const isOwner = Boolean(ctx?.isOwner)

  if (!ctx || !ctx.isAdmin) {
    return { data: emptyAdmin(orgName, isOwner) }
  }

  try {
    const supabase = await perfTrace('admin:createClient', () => createServerSupabase())
    const policy = await perfTrace('admin:operatingPolicy', () => loadOperatingPolicy(ctx.orgId))
    const now = currentInstant()
    const businessDate = orgDate(now, policy.timezone)
    const dayRange = businessDateRange(businessDate, policy.timezone)
    const yesterdayDate = addDays(businessDate, -1)
    const yesterdayRange = businessDateRange(yesterdayDate, policy.timezone)
    const weekStart = new Date(dayRange.start)
    weekStart.setUTCDate(weekStart.getUTCDate() - 7)

    const [teamDay, teamLiveFull, leadsResult, identitiesResult, assignmentsResult, profileEventsResult, activityResult, repsResult, overdueTasksByRep, unassignedTasks, waitingAndTransfers, unreadTaskUpdates, todayOutcomes, weekOutcomes, yesterdayAccountabilityResult, todayNewLeadsResult, yesterdayNewLeadsResult, yesterdayEventsResult, yesterdayOutcomes, inboxCounts] =
      await perfTrace('admin:main-batch', () => Promise.all([
        loadTeamDay(),
        loadTeamLive(ctx.orgId),
        supabase
          .from('leads')
          // Durable column only — never select a nonexistent lead timestamp.
          .select('id, company, status, owner_rep_id, revenue_identity_id, canonical_score, created_at')
          .eq('organization_id', ctx.orgId)
          .eq('archived', false)
          .in('status', OPEN_STATUSES)
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('revenue_identities')
          .select('id, identity_name, channel, profile_id')
          .eq('organization_id', ctx.orgId)
          .eq('status', 'active'),
        supabase
          .from('identity_assignments')
          .select('revenue_identity_id, rep_id')
          .eq('organization_id', ctx.orgId),
        // Profile rows: today's executed events by sending profile — the same
        // send / meeting / win rule as Team Performance (drafts, generated
        // copy and failures never count). Goal completions are not events.
        supabase
          .from('action_events')
          .select('actor_id, action_type, execution_status, lead_id, sender_profile_id')
          .eq('organization_id', ctx.orgId)
          .in('action_type', PERFORMANCE_ACTION_TYPES)
          .gte('occurred_at', dayRange.start)
          .lt('occurred_at', dayRange.end)
          .limit(5000),
        supabase
          .from('action_events')
          .select('id, actor_id, action_type, occurred_at, lead_id')
          .eq('organization_id', ctx.orgId)
          .in('action_type', [...MEANINGFUL_ACTIONS])
          .gte('occurred_at', weekStart.toISOString())
          .order('occurred_at', { ascending: false })
          .limit(40),
        supabase.from('reps').select('id, name').eq('organization_id', ctx.orgId),
        countOverdueAssignedByRep(supabase, ctx.orgId, null),
        countUnassignedOpenTasks(supabase, ctx.orgId),
        countWaitingAndTransferTasks(supabase, ctx.orgId),
        listUnreadTaskCommentCounts(supabase, ctx),
        loadOutcomeEventCounts(supabase, { orgId: ctx.orgId, repIds: null, start: dayRange.start, end: dayRange.end }),
        loadOutcomeEventCounts(supabase, { orgId: ctx.orgId, repIds: null, start: weekStart.toISOString(), end: dayRange.end }),
        supabase
          .from('daily_accountability')
          .select('rep_id, completed_count')
          .eq('organization_id', ctx.orgId)
          .eq('target_date', yesterdayDate)
          .limit(5000),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', ctx.orgId)
          .eq('archived', false)
          .gte('created_at', dayRange.start)
          .lt('created_at', dayRange.end),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', ctx.orgId)
          .eq('archived', false)
          .gte('created_at', yesterdayRange.start)
          .lt('created_at', yesterdayRange.end),
        supabase
          .from('action_events')
          .select('action_type, execution_status')
          .eq('organization_id', ctx.orgId)
          .in('action_type', ['REPLY_SENT', 'FOLLOWUP_SENT', 'UPWORK_PROPOSAL_PREPARED'])
          .gte('occurred_at', yesterdayRange.start)
          .lt('occurred_at', yesterdayRange.end)
          .limit(5000),
        loadOutcomeEventCounts(supabase, { orgId: ctx.orgId, repIds: null, start: yesterdayRange.start, end: yesterdayRange.end }),
        getInboxCountsForOrg(supabase, { orgId: ctx.orgId }).catch(() => null),
      ]))

    const allowed = new Set(teamDay.reps.map((r) => r.repId))
    const teamLive = filterTeamLiveToRepIds(teamLiveFull, allowed)
    const nameByRep = new Map((repsResult.data ?? []).map((r) => [r.id as string, r.name as string]))

    const openLeads: OpenLeadFact[] = (leadsResult.data ?? []).map((row) => ({
      id: row.id as string,
      company: ((row.company as string | null) ?? 'Untitled').trim() || 'Untitled',
      status: (row.status as string) ?? 'new',
      ownerRepId: (row.owner_rep_id as string | null) ?? null,
      ownerName: row.owner_rep_id ? nameByRep.get(row.owner_rep_id as string) ?? null : null,
      revenueIdentityId: (row.revenue_identity_id as string | null) ?? null,
      canonicalScore: (row.canonical_score as number | null) ?? null,
      updatedAt: (row.created_at as string | null) ?? null,
      lastOutboundAt: null,
    }))

    const leadsByIdentity = new Map<string, number>()
    for (const lead of openLeads) {
      if (!lead.revenueIdentityId) continue
      leadsByIdentity.set(lead.revenueIdentityId, (leadsByIdentity.get(lead.revenueIdentityId) ?? 0) + 1)
    }

    // Same attribution as Team Performance. Today's events on leads that are no
    // longer open (won, lost) still need their lead's identity as the fallback.
    const profileEvents = (profileEventsResult.data ?? []) as PerfEvent[]

    // Today's executed activity per rep — the same canonical event rule Team
    // Performance uses. Used for the comparison and the execution visual.
    const executionByRep = buildAdminExecutionByRep(profileEvents)

    const tasksCompletedTodayByRep = await perfTrace('admin:taskCompletions', () =>
      loadTaskCompletionCounts(ctx.orgId, dayRange.start, dayRange.end).catch(() => new Map<string, number>()))

    const tasksCompletedToday = [...tasksCompletedTodayByRep.values()].reduce((sum, n) => sum + n, 0)
    const executionToday = {
      repliesHandled: [...executionByRep.values()].reduce((sum, e) => sum + e.repliesSent, 0),
      followupsCompleted: [...executionByRep.values()].reduce((sum, e) => sum + e.followupsSent, 0),
      tasksCompleted: tasksCompletedToday,
      meetings: todayOutcomes.meetings,
    }

    // Profile-first execution: one row per sending profile, completion from the
    // same canonical pacing function Rep Home uses.
    const profileExecution: AdminProfileExecutionRow[] = buildTeamProfiles(teamLive).map((row) => ({
      profileId: row.profileId,
      name: row.profileName,
      channels: row.channels,
      assignedReps: row.assignedReps,
      targetCount: row.targetCount,
      completedCount: row.completedCount,
      remaining: row.remaining,
      status: profileCompletionStatus(row.targetCount, row.completedCount, teamDay.workdayProgress, policy.warningThresholds),
      followUps: row.followUps,
      proposals: row.proposals,
    }))

    const proposalsToday = profileEvents.filter(
      (event) => event.action_type === 'UPWORK_PROPOSAL_PREPARED' && event.execution_status !== 'failed',
    ).length

    // New qualified leads today — canonical score band on leads created today.
    const qualifiedToday = openLeads.filter((lead) => {
      if (!lead.updatedAt || lead.canonicalScore == null) return false
      if (lead.updatedAt < dayRange.start || lead.updatedAt >= dayRange.end) return false
      const band = qualifyCanonicalScore(lead.canonicalScore).qualification
      return band === 'STRONG' || band === 'WORTH_PURSUING'
    }).length

    const teamTarget = teamLive.people.reduce((sum, person) => sum + person.totalTarget, 0)
    const teamCompleted = teamLive.people.reduce((sum, person) => sum + person.totalCompleted, 0)

    const movement: AdminMovement = {
      newLeadsToday: todayNewLeadsResult.count ?? 0,
      qualifiedToday,
      repliesHandledToday: executionToday.repliesHandled,
      followupsToday: executionToday.followupsCompleted,
      meetingsToday: todayOutcomes.meetings,
      winsToday: todayOutcomes.wins,
      proposalsToday,
    }

    const yesterdayEvents = (yesterdayEventsResult.data ?? []) as Array<{ action_type: string; execution_status: string | null }>
    const countYesterday = (actionType: string) =>
      yesterdayEvents.filter((event) => event.action_type === actionType && event.execution_status !== 'failed').length
    const yesterday: AdminYesterday = {
      completed: (yesterdayAccountabilityResult.data ?? []).reduce(
        (sum, row) => sum + (row.completed_count ?? 0),
        0,
      ),
      replies: countYesterday('REPLY_SENT'),
      followups: countYesterday('FOLLOWUP_SENT'),
      meetings: yesterdayOutcomes.meetings,
      wins: yesterdayOutcomes.wins,
      proposals: countYesterday('UPWORK_PROPOSAL_PREPARED'),
      newLeads: yesterdayNewLeadsResult.count ?? 0,
    }
    const identityByLead = new Map(openLeads.map((l) => [l.id, l.revenueIdentityId]))
    const closedLeadIds = [...new Set(profileEvents.map((e) => e.lead_id).filter((id): id is string => !!id && !identityByLead.has(id)))]
    const closedLeads = await chunkedIn<{ id: string; revenue_identity_id: string | null }>(closedLeadIds, (chunk) =>
      supabase.from('leads').select('id, revenue_identity_id').eq('organization_id', ctx.orgId).in('id', chunk),
    ).catch(() => [])
    for (const l of closedLeads) identityByLead.set(l.id, l.revenue_identity_id)
    const byIdentity = groupMetrics(
      profileEvents,
      identityResolver((identitiesResult.data ?? []) as Array<{ id: string; profile_id: string | null }>, (id) => identityByLead.get(id)),
    )

    const assignedIdentityIds = new Set(
      (assignmentsResult.data ?? [])
        .map((a) => a.revenue_identity_id as string | null)
        .filter((id): id is string => Boolean(id)),
    )
    const unassignedProfiles = (identitiesResult.data ?? []).filter(
      (identity) => !assignedIdentityIds.has(identity.id as string),
    ).length

    // Upwork coverage: which sending profiles can actually be used for
    // proposals, and which reps have none. Derived from the same identity +
    // assignment rows already loaded — no extra query.
    const upworkIdentityIds = (identitiesResult.data ?? [])
      .filter((identity) => normalizeChannel(identity.channel as string) === 'upwork')
      .map((identity) => identity.id as string)
    const upworkAssignedRepIds = new Set(
      (assignmentsResult.data ?? [])
        .filter((a) => upworkIdentityIds.includes(a.revenue_identity_id as string))
        .map((a) => a.rep_id as string),
    )
    const upworkCoverage = {
      upworkIdentities: upworkIdentityIds.length,
      upworkUnassigned: upworkIdentityIds.filter((id) => !assignedIdentityIds.has(id)).length,
      repsWithoutUpwork: (repsResult.data ?? []).filter(
        (rep) => !upworkAssignedRepIds.has(rep.id as string),
      ).length,
    }

    const profiles: ProfilePerformanceRow[] = (identitiesResult.data ?? [])
      .filter((i) => assignedIdentityIds.has(i.id as string) || leadsByIdentity.has(i.id as string))
      .map((i) => {
        const id = i.id as string
        const m = byIdentity.get(id)
        const messagesSent = m ? m.connections + m.messages : 0
        const replies = m?.replies ?? 0
        return {
          identityId: id,
          name: (i.identity_name as string) ?? 'Unnamed',
          channel: (i.channel as string) ?? 'other',
          assignedLeads: leadsByIdentity.get(id) ?? 0,
          messagesSent,
          replies,
          meetings: m?.meetings ?? 0,
          proposals: m?.proposals ?? 0,
          wins: m?.wins ?? 0,
          replyRate: messagesSent > 0 ? Math.round((replies / messagesSent) * 100) : null,
        }
      })
      .sort((a, b) => b.assignedLeads - a.assignedLeads)
      .slice(0, 12)

    const activity: ManagerActivityItem[] = []
    for (const row of activityResult.data ?? []) {
      const label = activityLabelForAction(row.action_type as string)
      if (!label) continue
      const actor = nameByRep.get(row.actor_id as string)
      const leadId = row.lead_id as string | null
      activity.push({
        id: row.id as string,
        label,
        detail: actor ?? '',
        occurredAt: row.occurred_at as string,
        href: leadId ? `/leads/${leadId}` : null,
      })
      if (activity.length >= 15) break
    }

    // Canonical outcome events (src/lib/sales/meetings.ts) — not the 40-row
    // activity sample, and not self-reported goal completions.
    const meetingsThisWeek = weekOutcomes.meetings
    const wins = weekOutcomes.wins

    const data = assembleAdminCommandCenter({
      orgName,
      isOwner,
      teamDay,
      teamLive,
      allowedRepIds: allowed,
      openLeads,
      profiles,
      activity,
      meetingsThisWeek,
      wins,
      overdueTasksByRep,
      unassignedTasks,
      waitingTasks: waitingAndTransfers.waiting,
      transferRequests: waitingAndTransfers.transferRequests,
      unreadTaskUpdates: [...unreadTaskUpdates.values()].reduce((sum, n) => sum + n, 0),
      outcomeEventsByRep: todayOutcomes.byActor,
      profileExecution,
      movement,
      yesterday,
      teamTarget,
      teamCompleted,
      inboxCounts: inboxCounts ?? undefined,
    })

    return {
      data: {
        ...data,
        executionByRep,
        tasksCompletedTodayByRep,
        executionToday,
        unassignedProfiles,
        upworkCoverage,
      },
    }
  } catch (err) {
    console.error('loadAdminCommandCenter failed:', err)
    return { data: emptyAdmin(orgName, isOwner), error: true }
  }
}

/** Assigned tasks completed today, grouped by assignee. */
async function loadTaskCompletionCounts(
  orgId: string,
  start: string,
  end: string,
): Promise<Map<string, number>> {
  const supabase = await createServerSupabase()
  if (supabase.provider !== 'neon' || !supabase.raw) return new Map()
  const { sql, params } = taskCompletionCountsSql({ orgId, repIds: null, start, end })
  const res = await supabase.raw<{ key: string | null; n: number }[]>(sql, params)
  if (res.error || !Array.isArray(res.data)) return new Map()
  return new Map(
    res.data
      .filter((row) => row.key)
      .map((row) => [String(row.key), Number(row.n)]),
  )
}
