import { getAuthContext } from '@/lib/auth/organization'
import { getCurrentUser } from '@/lib/auth/current'
import { createServerSupabase } from '@/lib/supabase/server'
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
  const [ctx, user] = await Promise.all([getAuthContext(), getCurrentUser()])
  const orgName = user?.organization.name ?? 'Organization'
  const isOwner = Boolean(ctx?.isOwner)

  if (!ctx || !ctx.isAdmin) {
    return { data: emptyAdmin(orgName, isOwner) }
  }

  try {
    const supabase = await createServerSupabase()
    const policy = await loadOperatingPolicy(ctx.orgId)
    const now = currentInstant()
    const businessDate = orgDate(now, policy.timezone)
    const dayRange = businessDateRange(businessDate, policy.timezone)
    const weekStart = new Date(dayRange.start)
    weekStart.setUTCDate(weekStart.getUTCDate() - 7)

    const [teamDay, teamLiveFull, leadsResult, identitiesResult, assignmentsResult, accountabilityResult, activityResult, repsResult, overdueTasksByRep, unassignedTasks] =
      await Promise.all([
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
          .select('id, identity_name, channel')
          .eq('organization_id', ctx.orgId)
          .eq('status', 'active'),
        supabase
          .from('identity_assignments')
          .select('revenue_identity_id, rep_id')
          .eq('organization_id', ctx.orgId),
        supabase
          .from('daily_accountability')
          .select('revenue_identity_id, activity_type, completed_count')
          .eq('organization_id', ctx.orgId)
          .eq('target_date', businessDate),
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
      ])

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

    const sentByIdentity = new Map<string, number>()
    const replyByIdentity = new Map<string, number>()
    const meetingsByIdentity = new Map<string, number>()
    const proposalsByIdentity = new Map<string, number>()
    const winsByIdentity = new Map<string, number>()
    for (const row of accountabilityResult.data ?? []) {
      const id = row.revenue_identity_id as string
      const type = String(row.activity_type ?? '').toLowerCase()
      const n = (row.completed_count as number) ?? 0
      if (type.includes('meeting')) meetingsByIdentity.set(id, (meetingsByIdentity.get(id) ?? 0) + n)
      else if (type.includes('proposal')) proposalsByIdentity.set(id, (proposalsByIdentity.get(id) ?? 0) + n)
      else if (type.includes('win')) winsByIdentity.set(id, (winsByIdentity.get(id) ?? 0) + n)
      else if (type.includes('reply')) replyByIdentity.set(id, (replyByIdentity.get(id) ?? 0) + n)
      else if (
        type.includes('dm')
        || type.includes('connection')
        || type.includes('email')
        || type.includes('followup')
        || type.includes('follow_up')
      ) {
        sentByIdentity.set(id, (sentByIdentity.get(id) ?? 0) + n)
      }
    }

    const assignedIdentityIds = new Set(
      (assignmentsResult.data ?? [])
        .map((a) => a.revenue_identity_id as string | null)
        .filter((id): id is string => Boolean(id)),
    )

    const profiles: ProfilePerformanceRow[] = (identitiesResult.data ?? [])
      .filter((i) => assignedIdentityIds.has(i.id as string) || leadsByIdentity.has(i.id as string))
      .map((i) => {
        const id = i.id as string
        const messagesSent = sentByIdentity.get(id) ?? 0
        const replies = replyByIdentity.get(id) ?? 0
        return {
          identityId: id,
          name: (i.identity_name as string) ?? 'Unnamed',
          channel: (i.channel as string) ?? 'other',
          assignedLeads: leadsByIdentity.get(id) ?? 0,
          messagesSent,
          replies,
          meetings: meetingsByIdentity.get(id) ?? 0,
          proposals: proposalsByIdentity.get(id) ?? 0,
          wins: winsByIdentity.get(id) ?? 0,
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

    let meetingsThisWeek = 0
    let wins = 0
    for (const row of activityResult.data ?? []) {
      if (row.action_type === 'MEETING_BOOKED') meetingsThisWeek += 1
      if (row.action_type === 'CLIENT_WON') wins += 1
    }
    // Prefer accountability wins when present.
    const accountabilityWins = [...winsByIdentity.values()].reduce((a, b) => a + b, 0)
    if (accountabilityWins > wins) wins = accountabilityWins

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
    })

    return { data }
  } catch (err) {
    console.error('loadAdminCommandCenter failed:', err)
    return { data: emptyAdmin(orgName, isOwner), error: true }
  }
}
