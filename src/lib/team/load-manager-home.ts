import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { loadTeamDay } from '@/lib/rep-day/team'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { businessDateRange, currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import {
  activityLabelForAction,
  assembleManagerHomeTeamData,
  filterTeamLiveToRepIds,
  type ManagerActivityItem,
  type ManagerHomeTeamData,
} from '@/lib/team/manager-home-summary'
import { countOverdueAssignedByRep } from '@/lib/tasks/assigned-tasks'
import { loadOutcomeEventCounts } from '@/lib/operations/outcome-events'
import { listExecutableIdentityScope } from '@/lib/coverage/access'
import { getInboxCountsForRep } from '@/lib/operations/inbox-counts'
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

/**
 * Manager Home team payload.
 *
 * Parallel waves (no per-rep waterfall):
 * 1. loadTeamDay (already batched + scoped)
 * 2. loadTeamLive (org batched) → filtered to managed reps
 * 3. team names + recent meaningful activity
 *
 * Team metrics are NEVER filtered by the manager's active sending profile.
 */
export async function loadManagerHomeTeam(): Promise<{
  data: ManagerHomeTeamData
  error?: boolean
}> {
  const ctx = await getAuthContext()
  if (!ctx || (!ctx.isManager && !ctx.isAdmin)) {
    return {
      data: {
        teamName: 'Team',
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
    }
  }

  try {
    const store = await createScoutStore()
    const [teamDay, teamLiveFull] = await Promise.all([
      loadTeamDay(),
      loadTeamLive(ctx.orgId),
    ])

    const allowed = new Set(teamDay.reps.map((r) => r.repId))
    // loadTeamDay already scopes; keep live in lockstep.
    const teamLive = filterTeamLiveToRepIds(teamLiveFull, allowed)

    const client = store.getSupabaseClient()
    const today = businessDateRange(teamDay.businessDate, teamDay.timezone)
    const [teamNames, activity, overdueTasksByRep, outcomeEvents] = await Promise.all([
      Promise.all(
        ctx.managedTeamIds.map(async (teamId) => {
          const info = await store.getTeamInfo(teamId)
          return info?.name ?? null
        }),
      ),
      loadRecentTeamActivity(ctx.orgId, allowed),
      countOverdueAssignedByRep(client, ctx.orgId, [...allowed]),
      loadOutcomeEventCounts(client, { orgId: ctx.orgId, repIds: [...allowed], start: today.start, end: today.end }),
    ])

    const named = teamNames.filter(Boolean) as string[]
    const teamName =
      named.length === 0
        ? 'My Team'
        : named.length === 1
          ? named[0]
          : named.join(' · ')

    // Canonical Inbox counts per managed rep over each rep's executable
    // profiles (primary + active coverage). Team scope never uses the
    // manager's personal identity.
    const inboxCountsByRep = await perfTrace('manager:inboxCounts', () =>
      Promise.all([...allowed].map(async (repId) => {
        const scope = await listExecutableIdentityScope(client, ctx.orgId, repId, teamDay.businessDate)
        const counts = await getInboxCountsForRep(client, {
          orgId: ctx.orgId,
          repId,
          executableIdentities: scope.executableIdentities,
          coveredIdentityIds: scope.coveredIdentityIds,
        }).catch(() => null)
        return [repId, counts ? { needsReply: counts.needsReply, followups: counts.followups } : null] as const
      })).then((entries) => new Map(entries.filter((entry): entry is [string, { needsReply: number; followups: number }] => entry[1] !== null))),
    )

    const data = assembleManagerHomeTeamData({
      teamName,
      teamDay,
      teamLive,
      allowedRepIds: allowed,
      activity,
      overdueTasksByRep,
      outcomeEventsByRep: outcomeEvents.byActor,
      inboxCountsByRep,
    })

    return { data }
  } catch (err) {
    console.error('loadManagerHomeTeam failed:', err)
    return {
      data: {
        teamName: 'My Team',
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
      error: true,
    }
  }
}

async function loadRecentTeamActivity(
  orgId: string,
  allowedRepIds: Set<string>,
): Promise<ManagerActivityItem[]> {
  if (allowedRepIds.size === 0) return []
  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(orgId)
  const now = currentInstant()
  const businessDate = orgDate(now, policy.timezone)
  // Look back 7 business-calendar days via ISO range on the org clock day.
  const { start } = businessDateRange(businessDate, policy.timezone)
  const startDate = new Date(start)
  startDate.setUTCDate(startDate.getUTCDate() - 7)

  const { data } = await supabase
    .from('action_events')
    .select('id, actor_id, action_type, occurred_at, lead_id')
    .eq('organization_id', orgId)
    .in('actor_id', [...allowedRepIds])
    .in('action_type', [...MEANINGFUL_ACTIONS])
    .gte('occurred_at', startDate.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(30)

  const items: ManagerActivityItem[] = []
  for (const row of data ?? []) {
    const label = activityLabelForAction(row.action_type as string)
    if (!label) continue
    const leadId = row.lead_id as string | null
    items.push({
      id: row.id as string,
      label,
      detail: '',
      occurredAt: row.occurred_at as string,
      href: leadId ? `/leads/${leadId}` : null,
    })
    if (items.length >= 10) break
  }
  return items
}
