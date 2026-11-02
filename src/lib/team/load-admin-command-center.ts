import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/organization'
import { getCurrentUser } from '@/lib/auth/current'
import { loadTeamDay } from '@/lib/rep-day/team'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { businessDateRange, currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { activityLabelForAction, filterTeamLiveToRepIds } from '@/lib/team/manager-home-summary'
import {
  assembleAdminCommandCenter,
  type AdminCommandCenterData,
  type OpenLeadFact,
  type ProfilePerformanceRow,
} from '@/lib/team/admin-command-summary'
import type { ManagerActivityItem } from '@/lib/team/manager-home-summary'
import {
  countOverdueAssignedByRep,
  countUnassignedOpenTasks,
} from '@/lib/tasks/assigned-tasks'
import { loadOutcomeEventCounts } from '@/lib/operations/outcome-events'
import { groupMetrics, identityResolver, PERFORMANCE_ACTION_TYPES, type PerfEvent } from '@/lib/operations/performance'
import { chunkedIn } from '@/lib/supabase/chunked-in'
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
    const weekStart = new Date(dayRange.start)
    weekStart.setUTCDate(weekStart.getUTCDate() - 7)

    const [teamDay, teamLiveFull, leadsResult, identitiesResult, assignmentsResult, profileEventsResult, activityResult, repsResult, overdueTasksByRep, unassignedTasks, todayOutcomes, weekOutcomes] =
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
        loadOutcomeEventCounts(supabase, { orgId: ctx.orgId, repIds: null, start: dayRange.start, end: dayRange.end }),
        loadOutcomeEventCounts(supabase, { orgId: ctx.orgId, repIds: null, start: weekStart.toISOString(), end: dayRange.end }),
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
      outcomeEventsByRep: todayOutcomes.byActor,
    })

    return { data }
  } catch (err) {
    console.error('loadAdminCommandCenter failed:', err)
    return { data: emptyAdmin(orgName, isOwner), error: true }
  }
}
