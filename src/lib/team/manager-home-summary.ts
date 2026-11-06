/**
 * Assembles Manager Home team rows from batched Team Day + Team Live payloads.
 *
 * Scope rules:
 * - Team metrics: managed reps only (never filtered by manager's personal profile)
 * - Personal My Work: comes from RepWorkspaceData separately (profile-scoped)
 */
import { qualifyCanonicalScore } from '@/lib/scoring/qualification'
import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { TeamLivePayload, TeamLivePerson } from '@/lib/admin/team-live'
import {
  buildTeamAttention,
  deriveRepStatus,
  type AttentionSignal,
  type ManagerRepSnapshot,
  type RepStatus,
} from '@/lib/team/attention-policy'

export interface ManagerTeamRow {
  repId: string
  repName: string
  activeProfile: string | null
  channel: string | null
  completedToday: number
  repliesWaiting: number
  followUpsOverdue: number
  highPriority: number
  overdueTasks: number
  meetings: number
  wins: number
  targetPct: number
  /** Canonical daily target sum; undefined when the snapshot has no target data. */
  totalTarget?: number
  status: RepStatus
}

export interface ManagerTeamMetrics {
  repliesWaiting: number
  followUpsOverdue: number
  highPriority: number
  completedToday: number
  meetings: number
  wins: number
}

export interface ManagerActivityItem {
  id: string
  label: string
  detail: string
  occurredAt: string
  href: string | null
}

export interface ManagerHomeTeamData {
  teamName: string
  memberCount: number
  needsAttentionCount: number
  metrics: ManagerTeamMetrics
  attention: AttentionSignal[]
  rows: ManagerTeamRow[]
  activity: ManagerActivityItem[]
  /** Explicit: team scope is independent of active sending profile. */
  scopeNote: 'managed_team'
}

function highPriorityCount(person: TeamLivePerson): number {
  return person.openLeads.filter((lead) => {
    if (lead.status === 'replied') return false
    if (lead.score == null) return false
    const band = qualifyCanonicalScore(lead.score).qualification
    return band === 'STRONG' || band === 'WORTH_PURSUING'
  }).length
}

function followUpsOverdue(person: TeamLivePerson): number {
  // Canonical open statuses that sit in the follow-up lane on Team Live.
  // Full follow-up policy (messages + evaluateFollowUpPolicy) remains the
  // per-lead authority on Rep Home; team board uses status lane counts.
  return person.openLeads.filter((l) => l.status === 'followed_up' || l.status === 'contacted').length
}

function meetingsFromGoals(person: TeamLivePerson): number {
  return person.goals
    .filter((g) => /meeting/i.test(g.activityType) || /meeting/i.test(g.label))
    .reduce((sum, g) => sum + g.completed, 0)
}

function winsFromGoals(person: TeamLivePerson): number {
  return person.goals
    .filter((g) => /win/i.test(g.activityType) || /won/i.test(g.activityType))
    .reduce((sum, g) => sum + g.completed, 0)
}

export function assembleManagerRepSnapshots(input: {
  teamDay: TeamDaySummary
  teamLive: TeamLivePayload
  allowedRepIds: Set<string>
  /** Batched overdue assigned-task counts by rep id. */
  overdueTasksByRep?: Map<string, number>
  /**
   * Canonical meetings / wins (MEETING_BOOKED / CLIENT_WON events) for the
   * day. When given it is the only source; goal completions are a fallback
   * for callers that have not loaded events.
   */
  outcomeEventsByRep?: Map<string, { meetings: number; wins: number }>
}): ManagerRepSnapshot[] {
  const liveByRep = new Map(input.teamLive.people.map((p) => [p.repId, p]))
  const overdue = input.overdueTasksByRep ?? new Map<string, number>()
  const outcomes = input.outcomeEventsByRep
  const meetingsFor = (repId: string, live: TeamLivePerson | undefined) =>
    outcomes ? outcomes.get(repId)?.meetings ?? 0 : live ? meetingsFromGoals(live) : 0
  const winsFor = (repId: string, live: TeamLivePerson | undefined) =>
    outcomes ? outcomes.get(repId)?.wins ?? 0 : live ? winsFromGoals(live) : 0
  const snaps: ManagerRepSnapshot[] = []

  for (const row of input.teamDay.reps) {
    if (!input.allowedRepIds.has(row.repId)) continue
    const live = liveByRep.get(row.repId)
    const totalTarget = live?.totalTarget ?? 0
    const totalCompleted = live?.totalCompleted ?? row.actionsToday
    const targetPct = totalTarget > 0 ? (totalCompleted / totalTarget) * 100 : row.commitmentProgress * 100
    const profile = row.identities[0] ?? null

    snaps.push({
      repId: row.repId,
      repName: row.repName,
      activeProfile: profile?.name ?? live?.identities[0]?.name ?? null,
      completedToday: totalCompleted,
      repliesWaiting: row.repliesWaiting,
      followUpsOverdue: live ? followUpsOverdue(live) : 0,
      highPriorityUntouched: live ? highPriorityCount(live) : 0,
      overdueTasks: overdue.get(row.repId) ?? 0,
      meetings: meetingsFor(row.repId, live),
      wins: winsFor(row.repId, live),
      targetPct,
      totalTarget,
      // Ages only when measured; never invent hours for severity.
      oldestReplyAgeHours: null,
      oldestFollowUpAgeHours: null,
      oldestHighPriorityAgeHours: null,
      oldestOverdueTaskAgeHours: null,
      lastActivityAt: row.lastActivityAt ?? live?.lastActivityAt ?? null,
      hasProfileAssignment: (row.identities.length > 0) || (live?.identityCount ?? 0) > 0,
      requiredRemaining: row.requiredRemaining,
      dayState: row.state,
    })
  }

  // Include live people missing from team day (should be rare).
  for (const person of input.teamLive.people) {
    if (!input.allowedRepIds.has(person.repId)) continue
    if (snaps.some((s) => s.repId === person.repId)) continue
    const totalTarget = person.totalTarget
    const targetPct = totalTarget > 0 ? (person.totalCompleted / totalTarget) * 100 : 0
    snaps.push({
      repId: person.repId,
      repName: person.repName,
      activeProfile: person.identities[0]?.name ?? null,
      completedToday: person.totalCompleted,
      repliesWaiting: person.openLeads.filter((l) => l.status === 'replied').length,
      followUpsOverdue: followUpsOverdue(person),
      highPriorityUntouched: highPriorityCount(person),
      overdueTasks: overdue.get(person.repId) ?? 0,
      meetings: meetingsFor(person.repId, person),
      wins: winsFor(person.repId, person),
      targetPct,
      totalTarget: person.totalTarget,
      oldestReplyAgeHours: null,
      oldestFollowUpAgeHours: null,
      oldestHighPriorityAgeHours: null,
      oldestOverdueTaskAgeHours: null,
      lastActivityAt: person.lastActivityAt,
      hasProfileAssignment: person.identityCount > 0,
      requiredRemaining: person.totalRemaining,
      dayState: null,
    })
  }

  return snaps
}

export function assembleManagerHomeTeamData(input: {
  teamName: string
  teamDay: TeamDaySummary
  teamLive: TeamLivePayload
  allowedRepIds: Set<string>
  activity?: ManagerActivityItem[]
  overdueTasksByRep?: Map<string, number>
  outcomeEventsByRep?: Map<string, { meetings: number; wins: number }>
}): ManagerHomeTeamData {
  const snaps = assembleManagerRepSnapshots(input)
  const attention = buildTeamAttention(snaps)
  const attentionRepIds = new Set(attention.map((s) => s.repId))

  const rows: ManagerTeamRow[] = snaps
    .map((snap) => {
      const signals = attention.filter((s) => s.repId === snap.repId)
      const live = input.teamLive.people.find((p) => p.repId === snap.repId)
      return {
        repId: snap.repId,
        repName: snap.repName,
        activeProfile: snap.activeProfile,
        channel: live?.identities[0]?.channel ?? null,
        completedToday: snap.completedToday,
        repliesWaiting: snap.repliesWaiting,
        followUpsOverdue: snap.followUpsOverdue,
        highPriority: snap.highPriorityUntouched,
        overdueTasks: snap.overdueTasks,
        meetings: snap.meetings,
        wins: snap.wins,
        targetPct: Math.round(snap.targetPct),
        totalTarget: snap.totalTarget ?? 0,
        status: deriveRepStatus(signals),
      }
    })
    .sort((a, b) => {
      const rank = { Critical: 0, Attention: 1, 'On track': 2 } as const
      const byStatus = rank[a.status] - rank[b.status]
      if (byStatus !== 0) return byStatus
      return a.repName.localeCompare(b.repName)
    })

  const metrics: ManagerTeamMetrics = snaps.reduce(
    (acc, snap) => {
      acc.repliesWaiting += snap.repliesWaiting
      acc.followUpsOverdue += snap.followUpsOverdue
      acc.highPriority += snap.highPriorityUntouched
      acc.completedToday += snap.completedToday
      acc.meetings += snap.meetings
      acc.wins += snap.wins
      return acc
    },
    { repliesWaiting: 0, followUpsOverdue: 0, highPriority: 0, completedToday: 0, meetings: 0, wins: 0 },
  )

  return {
    teamName: input.teamName,
    memberCount: snaps.length,
    needsAttentionCount: attentionRepIds.size,
    metrics,
    attention: attention.slice(0, 12),
    rows,
    activity: (input.activity ?? []).slice(0, 10),
    scopeNote: 'managed_team',
  }
}

/** Filter Team Live people to managed scope — never org-wide for managers. */
export function filterTeamLiveToRepIds(payload: TeamLivePayload, allowed: Set<string>): TeamLivePayload {
  return {
    ...payload,
    people: payload.people.filter((p) => allowed.has(p.repId)),
  }
}

export function activityLabelForAction(actionType: string): string | null {
  switch (actionType) {
    case 'REPLY_SENT':
      return 'Positive reply'
    case 'MEETING_BOOKED':
      return 'Meeting booked'
    case 'UPWORK_APPLIED':
    case 'UPWORK_PROPOSAL_PREPARED':
      return 'Proposal sent'
    case 'CLIENT_WON':
      return 'Won'
    case 'LEAD_LOST':
    case 'CLIENT_LOST':
      return 'Lost'
    case 'LEAD_REFERRED':
      return 'Lead reassigned'
    default:
      return null
  }
}
