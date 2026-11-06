/**
 * Admin / Owner Command Center assembly.
 *
 * Team execution rows reuse Manager assembly so status parity is guaranteed
 * for the same underlying snapshots.
 */
import { qualifyCanonicalScore } from '@/lib/scoring/qualification'
import { stageRatioPct } from '@/lib/operations/reports'
import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { TeamLivePayload } from '@/lib/admin/team-live'
import type { DailyActivity, ActivityTrendPoint } from '@/lib/performance/activity-model'
import {
  assembleManagerHomeTeamData,
  type ManagerActivityItem,
  type ManagerHomeTeamData,
  type ManagerTeamRow,
} from '@/lib/team/manager-home-summary'
import type { AttentionSignal } from '@/lib/team/attention-policy'

export interface OrgHealthMetrics {
  activeOpportunities: number
  repliesWaiting: number
  repliesCritical: number
  followUpsOverdue: number
  overdueTasks: number
  meetingsThisWeek: number
  wins: number
}

export interface PipelineStageHealth {
  key: string
  label: string
  count: number
  conversionPct: number | null
  stalledCount: number
  href: string
}

export interface StuckOpportunity {
  id: string
  company: string
  reason: string
  severity: 'attention' | 'critical'
  href: string
  ownerName: string | null
}

export interface ProfilePerformanceRow {
  identityId: string
  name: string
  channel: string
  assignedLeads: number
  messagesSent: number
  replies: number
  meetings: number
  proposals: number
  wins: number
  replyRate: number | null
}

export interface AdminCommandCenterData {
  orgName: string
  isOwner: boolean
  health: OrgHealthMetrics
  attention: AttentionSignal[]
  team: ManagerHomeTeamData
  rows: ManagerTeamRow[]
  pipeline: PipelineStageHealth[]
  stuck: StuckOpportunity[]
  profiles: ProfilePerformanceRow[]
  /** Active channel identities with no rep assignment — surfaced, never buried. */
  unassignedProfiles?: number
  activity: ManagerActivityItem[]
  /** 12-week org daily activity for the team heatmap (null when unavailable). */
  activityDaily?: DailyActivity[] | null
  /** Pre-merged trend points (replies, meetings, wins) for the org trend. */
  trendPoints?: ActivityTrendPoint[] | null
  /** Today's executed replies / follow-ups per rep — the same rule as Team Performance. */
  executionByRep?: Map<string, { repliesSent: number; followupsSent: number }> | null
  /** Assigned tasks completed today, by assignee. */
  tasksCompletedTodayByRep?: Map<string, number>
  /** Org-wide today totals for the team progress visual. */
  executionToday?: {
    repliesHandled: number
    followupsCompleted: number
    tasksCompleted: number
    meetings: number
  } | null
  scopeNote: 'organization'
}

export interface OpenLeadFact {
  id: string
  company: string
  status: string
  ownerRepId: string | null
  ownerName: string | null
  revenueIdentityId: string | null
  canonicalScore: number | null
  updatedAt: string | null
  lastOutboundAt: string | null
}

const FUNNEL: Array<{ key: string; label: string; match: (s: string) => boolean; href: string }> = [
  { key: 'qualified', label: 'Qualified', match: (s) => s === 'new', href: '/leads?filter=new' },
  { key: 'contacted', label: 'Contacted', match: (s) => s === 'contacted', href: '/leads?filter=contacted' },
  {
    key: 'conversation',
    label: 'Conversation',
    match: (s) => s === 'followed_up' || s === 'replied',
    href: '/leads?filter=reply',
  },
  { key: 'meeting', label: 'Meeting', match: (s) => s === 'meeting' || s === 'meeting_booked', href: '/leads' },
  { key: 'proposal', label: 'Proposal', match: (s) => s === 'proposal' || s === 'proposed', href: '/leads' },
  { key: 'won', label: 'Won', match: (s) => s === 'won', href: '/leads?filter=won' },
]

export function buildPipelineHealth(leads: OpenLeadFact[], now = Date.now()): PipelineStageHealth[] {
  const stages = FUNNEL.map((step) => {
    const matched = leads.filter((l) => step.match(l.status))
    const stalledCount = matched.filter((l) => {
      const ts = l.lastOutboundAt ?? l.updatedAt
      if (!ts) return false
      const ageDays = (now - new Date(ts).getTime()) / 86_400_000
      return ageDays > 7 && l.status !== 'won'
    }).length
    return { step, count: matched.length, stalledCount }
  })

  return stages.map((row, i) => {
    const prev = i === 0 ? null : stages[i - 1].count
    const conversionPct = stageRatioPct(row.count, prev)
    return {
      key: row.step.key,
      label: row.step.label,
      count: row.count,
      conversionPct,
      stalledCount: row.stalledCount,
      href: row.step.href,
    }
  })
}

export function buildStuckOpportunities(leads: OpenLeadFact[], now = Date.now()): StuckOpportunity[] {
  const stuck: StuckOpportunity[] = []

  for (const lead of leads) {
    if (['won', 'lost', 'dead', 'no'].includes(lead.status)) continue

    if (!lead.revenueIdentityId) {
      stuck.push({
        id: lead.id,
        company: lead.company,
        reason: 'Qualified lead with no profile assignment',
        severity: 'attention',
        href: `/leads/${lead.id}`,
        ownerName: lead.ownerName,
      })
      continue
    }

    if (lead.status === 'replied') {
      const ageH = lead.updatedAt ? (now - new Date(lead.updatedAt).getTime()) / 3_600_000 : null
      stuck.push({
        id: lead.id,
        company: lead.company,
        reason: ageH != null && ageH > 12 ? 'Reply waiting too long' : 'Reply waiting',
        severity: ageH != null && ageH > 12 ? 'critical' : 'attention',
        href: `/leads/${lead.id}?tab=conversation`,
        ownerName: lead.ownerName,
      })
      continue
    }

    const score = lead.canonicalScore
    if (score != null) {
      const band = qualifyCanonicalScore(score).qualification
      if ((band === 'STRONG' || band === 'WORTH_PURSUING') && lead.status === 'new') {
        stuck.push({
          id: lead.id,
          company: lead.company,
          reason: 'High buyer intent with no activity',
          severity: 'attention',
          href: `/leads/${lead.id}`,
          ownerName: lead.ownerName,
        })
      }
    }
  }

  return stuck
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
      return a.company.localeCompare(b.company)
    })
    .slice(0, 12)
}

export function buildOrgAttentionExtras(input: {
  missingProfileCount: number
  stuckCritical: number
  unassignedTasks?: number
}): AttentionSignal[] {
  const extras: AttentionSignal[] = []
  if (input.missingProfileCount > 0) {
    extras.push({
      category: 'NO_PROFILE_ASSIGNMENT',
      repId: 'org',
      repName: 'Organization',
      count: input.missingProfileCount,
      reason: `${input.missingProfileCount} leads have no profile assignment`,
      severity: input.missingProfileCount >= 5 ? 'critical' : 'attention',
      oldestAgeHours: null,
      href: '/leads?filter=missing_profile',
    })
  }
  if ((input.unassignedTasks ?? 0) > 0) {
    extras.push({
      category: 'UNASSIGNED_TASKS',
      repId: 'org',
      repName: 'Organization',
      count: input.unassignedTasks!,
      reason: `${input.unassignedTasks} open tasks have inactive assignees`,
      severity: input.unassignedTasks! >= 3 ? 'critical' : 'attention',
      oldestAgeHours: null,
      href: '/tasks?source=ASSIGNED',
    })
  }
  return extras
}

export function assembleAdminCommandCenter(input: {
  orgName: string
  isOwner: boolean
  teamDay: TeamDaySummary
  teamLive: TeamLivePayload
  allowedRepIds: Set<string>
  openLeads: OpenLeadFact[]
  profiles: ProfilePerformanceRow[]
  activity: ManagerActivityItem[]
  meetingsThisWeek: number
  wins: number
  overdueTasksByRep?: Map<string, number>
  unassignedTasks?: number
  outcomeEventsByRep?: Map<string, { meetings: number; wins: number }>
}): AdminCommandCenterData {
  const team = assembleManagerHomeTeamData({
    teamName: input.orgName,
    teamDay: input.teamDay,
    teamLive: input.teamLive,
    allowedRepIds: input.allowedRepIds,
    activity: input.activity,
    overdueTasksByRep: input.overdueTasksByRep,
    outcomeEventsByRep: input.outcomeEventsByRep,
  })

  const missingProfileCount = input.openLeads.filter((l) => !l.revenueIdentityId).length
  const stuck = buildStuckOpportunities(input.openLeads)
  const extras = buildOrgAttentionExtras({
    missingProfileCount,
    stuckCritical: stuck.filter((s) => s.severity === 'critical').length,
    unassignedTasks: input.unassignedTasks,
  })

  const attention = [...extras, ...team.attention].sort((a, b) => {
    const rank = { critical: 0, attention: 1, normal: 2 } as const
    const bySev = rank[a.severity] - rank[b.severity]
    if (bySev !== 0) return bySev
    return b.count - a.count
  })

  const repliesCritical = attention
    .filter((s) => s.category === 'REPLIES_WAITING' && s.severity === 'critical')
    .reduce((n, s) => n + s.count, 0)

  const activeOpportunities = input.openLeads.filter(
    (l) => !['won', 'lost', 'dead', 'no'].includes(l.status),
  ).length

  return {
    orgName: input.orgName,
    isOwner: input.isOwner,
    health: {
      activeOpportunities,
      repliesWaiting: team.metrics.repliesWaiting,
      repliesCritical,
      followUpsOverdue: team.metrics.followUpsOverdue,
      overdueTasks: [...(input.overdueTasksByRep?.values() ?? [])].reduce((sum, n) => sum + n, 0),
      meetingsThisWeek: input.meetingsThisWeek,
      wins: input.wins,
    },
    attention: attention.slice(0, 15),
    team,
    rows: team.rows,
    pipeline: buildPipelineHealth(input.openLeads),
    stuck,
    profiles: input.profiles,
    activity: input.activity.slice(0, 15),
    scopeNote: 'organization',
  }
}
