import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { PeopleDirectory } from '@/lib/operations/people'
import type { TimelineRow } from '@/lib/operations/activity'
import type { CoveragePlan, CoverageProfileResult, CoverageStatus } from '@/lib/coverage/engine'
import type { IdentityPlanProgress } from '@/lib/targets/load-plan-progress'
import type { CanonicalAssignmentSet } from '@/lib/profiles/canonical'

/**
 * Team Command Center — one derived operational picture.
 *
 * Every number is computed here from the canonical contracts (Team Day, People
 * directory, Coverage plan, daily-plan progress, canonical assignments). The
 * page renders; it never recomputes. Pure derivations are unit-testable.
 */

export interface CommandSummary {
  people: number
  working: number
  behind: number
  onLeave: number
  repliesWaiting: number
  overdueTasks: number
  unassignedProfiles: number
  unacknowledged: number
  target: number
  completed: number
  remaining: number
  coverage: Record<CoverageStatus, number>
}

export type CommandSeverity = 'critical' | 'attention'

/** The only profile facts the command center needs beyond the canonical set. */
export interface CommandProfileFact {
  profileId: string
  profileName: string
  channels: string[]
  pendingAcknowledgementRepIds: string[]
}

export interface CommandAction {
  id: string
  rank: number
  severity: CommandSeverity
  category: 'coverage' | 'assignment' | 'acknowledgement' | 'target' | 'task'
  title: string
  detail: string
  href: string
  profileId?: string
  repId?: string
}

export interface CommandMatrixAssignment {
  profileId: string
  profileName: string
  channels: string[]
  role: 'PRIMARY' | 'OPERATOR' | 'BACKUP'
  shared: boolean
  target: number
  completed: number
  remaining: number
  contribution: number
  allocation: number | null
  status: string | null
}

export interface CommandMatrixRow {
  repId: string
  repName: string
  roleLabel: string
  availability: string | null
  assignments: CommandMatrixAssignment[]
}

export interface CommandTargetRow {
  identityId: string
  identityName: string
  channel: string
  profileId: string | null
  profileName: string
  target: number
  completed: number
  remaining: number
  allocated: boolean
  shared: boolean
  pace: IdentityPlanProgress['pace']
  expectedByNow: number
  contributors: Array<{ repId: string; repName: string; completedCount: number; allocation: number | null }>
}

export interface CommandCenterData {
  businessDate: string
  timezone: string
  isWorkingDay: boolean
  summary: CommandSummary
  actions: CommandAction[]
  matrix: CommandMatrixRow[]
  targets: CommandTargetRow[]
  coverage: CoveragePlan
  profiles: CommandProfileFact[]
  timeline: TimelineRow[] | null
}

export interface CommandCenterInput {
  businessDate: string
  timezone: string
  isWorkingDay: boolean
  team: TeamDaySummary
  directory: PeopleDirectory
  plan: CoveragePlan
  progress: IdentityPlanProgress[]
  canonical: CanonicalAssignmentSet
  profiles: CommandProfileFact[]
  timeline: TimelineRow[] | null
  repNameById: Map<string, string>
}

const SEVERITY_RANK: Record<CommandSeverity, number> = { critical: 0, attention: 1 }
const CATEGORY_RANK: Record<CommandAction['category'], number> = {
  coverage: 0,
  assignment: 1,
  acknowledgement: 2,
  target: 3,
  task: 4,
}

/** Target rows: one per channel identity, lanes counted once, contributions named. */
export function buildCommandTargets(
  progress: IdentityPlanProgress[],
  repNameById: Map<string, string>,
): CommandTargetRow[] {
  return progress.map((row) => {
    const contributors = row.contributions.map((contribution) => ({
      repId: contribution.repId,
      repName: repNameById.get(contribution.repId) ?? 'Unknown',
      completedCount: contribution.completedCount,
      allocation:
        row.lanes.find((lane) => lane.allocations.some((allocation) => allocation.repId === contribution.repId))
          ?.allocations.find((allocation) => allocation.repId === contribution.repId)?.targetCount ?? null,
    }))
    return {
      identityId: row.identityId,
      identityName: row.identityName,
      channel: row.channel,
      profileId: row.personId,
      profileName: row.personName,
      target: row.target,
      completed: row.completed,
      remaining: row.remaining,
      allocated: row.allocated,
      // No allocation rows means a SHARED plan: every operator contributes to
      // this one requirement. Allocated plans are never marked shared.
      shared: !row.allocated,
      pace: row.pace,
      expectedByNow: row.expectedByNow,
      contributors,
    }
  })
}

/** Operator × profile matrix from the canonical assignment set. */
export function buildCommandMatrix(input: {
  directory: PeopleDirectory
  canonical: CanonicalAssignmentSet
  progress: IdentityPlanProgress[]
}): CommandMatrixRow[] {
  const progressByIdentity = new Map(input.progress.map((row) => [row.identityId, row]))
  const rows = new Map<string, CommandMatrixRow>()

  const ensure = (repId: string, repName: string, roleLabel: string, availability: string | null): CommandMatrixRow => {
    let row = rows.get(repId)
    if (!row) {
      row = { repId, repName, roleLabel, availability, assignments: [] }
      rows.set(repId, row)
    }
    return row
  }

  for (const profile of input.canonical.profiles) {
    const seats: Array<{ repId: string; repName: string; role: 'PRIMARY' | 'OPERATOR' | 'BACKUP' }> = []
    if (profile.primaryRepId) {
      seats.push({ repId: profile.primaryRepId, repName: profile.primaryRepName ?? 'Unknown', role: 'PRIMARY' })
    }
    for (const operator of profile.operators) {
      seats.push({ repId: operator.repId, repName: operator.repName, role: 'OPERATOR' })
    }
    for (const backup of profile.backups) {
      seats.push({ repId: backup.repId, repName: backup.repName, role: 'BACKUP' })
    }

    const identityProgress = profile.identityIds
      .map((identityId) => progressByIdentity.get(identityId))
      .filter((row): row is IdentityPlanProgress => Boolean(row))
    const target = identityProgress.reduce((sum, row) => sum + row.target, 0)
    const completed = identityProgress.reduce((sum, row) => sum + row.completed, 0)
    const status = identityProgress.find((row) => row.pace === 'complete') ? 'completed' : identityProgress[0]?.pace ?? null

    for (const seat of seats) {
      const directoryRow = input.directory.rows.find((row) => row.repId === seat.repId)
      const row = ensure(
        seat.repId,
        seat.repName,
        directoryRow?.roleLabel ?? 'Rep',
        directoryRow?.availability ?? null,
      )
      const contribution = identityProgress.reduce(
        (sum, progress) =>
          sum + (progress.contributions.find((entry) => entry.repId === seat.repId)?.completedCount ?? 0),
        0,
      )
      const allocation = identityProgress.reduce(
        (sum, progress) =>
          sum + (progress.allocations.find((entry) => entry.repId === seat.repId)?.targetCount ?? 0),
        0,
      )
      row.assignments.push({
        profileId: profile.profileId,
        profileName: profile.profileName,
        channels: profile.channels,
        role: seat.role,
        shared: seat.role === 'OPERATOR',
        target,
        completed,
        remaining: Math.max(0, target - completed),
        contribution,
        allocation: allocation > 0 ? allocation : null,
        status,
      })
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.assignments.length - a.assignments.length || a.repName.localeCompare(b.repName),
  )
}

/** Ranked action queue — the admin's next move, most urgent first. */
export function buildCommandActions(input: {
  plan: CoveragePlan
  canonical: CanonicalAssignmentSet
  directory: PeopleDirectory
  targets: CommandTargetRow[]
  profiles: CommandProfileFact[]
}): CommandAction[] {
  const actions: CommandAction[] = []
  const push = (action: Omit<CommandAction, 'rank'>) => actions.push({ ...action, rank: 0 })

  for (const item of input.plan.requiresApproval) {
    push({
      id: `approval:${item.profileId}:${item.kind}`,
      severity: 'critical',
      category: 'coverage',
      title: item.kind === 'RESTORE_PRIMARY' ? `Restore ${item.toRepName}` : `Cover ${item.fromRepName}`,
      detail: `${item.profileName} · ${item.reason}`,
      href: `/team/profiles/${item.profileId}`,
      profileId: item.profileId,
      repId: item.toRepId,
    })
  }

  for (const profile of input.plan.profiles) {
    if (profile.status === 'UNCOVERED') {
      push({
        id: `uncovered:${profile.profileId}`,
        severity: 'critical',
        category: 'coverage',
        title: `${profile.name} is uncovered`,
        detail: profile.primaryRepName ? `Primary ${profile.primaryRepName} is unavailable` : 'No primary operator',
        href: `/team/profiles/${profile.profileId}`,
        profileId: profile.profileId,
        repId: profile.primaryRepId ?? undefined,
      })
    } else if (profile.status === 'AT_RISK') {
      push({
        id: `at-risk:${profile.profileId}`,
        severity: 'attention',
        category: 'coverage',
        title: `${profile.name} is at risk`,
        detail: profile.ineligibleReason ?? 'No eligible backup can take over',
        href: `/team/profiles/${profile.profileId}`,
        profileId: profile.profileId,
      })
    }
    if (profile.coverageExpiring) {
      push({
        id: `expiring:${profile.profileId}`,
        severity: 'attention',
        category: 'coverage',
        title: `${profile.name} cover ends today`,
        detail: `Temporary cover ${profile.activeCoveringRepName ?? '—'} expires today`,
        href: `/team/profiles/${profile.profileId}`,
        profileId: profile.profileId,
      })
    }
  }

  for (const profile of input.canonical.unassigned) {
    push({
      id: `unassigned:${profile.profileId}`,
      severity: 'attention',
      category: 'assignment',
      title: `${profile.profileName} has no one assigned`,
      detail: profile.channels.length > 0 ? `Channels: ${profile.channels.join(', ')}` : 'No channel identity',
      href: `/team/profiles/${profile.profileId}`,
      profileId: profile.profileId,
    })
  }

  for (const profile of input.profiles) {
    if (profile.pendingAcknowledgementRepIds.length > 0) {
      push({
        id: `ack:${profile.profileId}`,
        severity: 'attention',
        category: 'acknowledgement',
        title: `${profile.profileName} needs acknowledgement`,
        detail: `${profile.channels.length > 0 ? `${profile.channels.join(' · ')} · ` : ''}${profile.pendingAcknowledgementRepIds.length} assignment${profile.pendingAcknowledgementRepIds.length === 1 ? '' : 's'} not confirmed`,
        href: `/team/profiles/${profile.profileId}`,
        profileId: profile.profileId,
      })
    }
  }

  for (const row of input.directory.rows) {
    if (row.overdueTasks > 0) {
      push({
        id: `overdue:${row.repId}`,
        severity: 'attention',
        category: 'task',
        title: `${row.repName} has ${row.overdueTasks} overdue task${row.overdueTasks === 1 ? '' : 's'}`,
        detail: 'Assigned work past due',
        href: `/team/${row.repId}?tab=work&view=overdue`,
        repId: row.repId,
      })
    }
  }

  for (const target of input.targets) {
    if (target.target > 0 && target.completed < target.expectedByNow) {
      push({
        id: `target:${target.identityId}`,
        severity: 'attention',
        category: 'target',
        title: `${target.profileName} · ${target.channel} is behind`,
        detail: `${target.completed} of ${target.target} by now (${target.expectedByNow} expected)`,
        href: `/team/profiles/${target.profileId ?? ''}`,
        profileId: target.profileId ?? undefined,
      })
    }
  }

  return actions
    .map((action) => ({
      ...action,
      rank:
        SEVERITY_RANK[action.severity] * 100 +
        CATEGORY_RANK[action.category] * 10 +
        (action.category === 'coverage' ? 0 : 1),
    }))
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .slice(0, 12)
}

export function deriveCommandSummary(input: {
  team: TeamDaySummary
  plan: CoveragePlan
  canonical: CanonicalAssignmentSet
  targets: CommandTargetRow[]
  profiles: CommandProfileFact[]
}): CommandSummary {
  const coverage: Record<CoverageStatus, number> = { COVERED: 0, BACKUP_ACTIVE: 0, AT_RISK: 0, UNCOVERED: 0 }
  for (const profile of input.plan.profiles) coverage[profile.status] += 1
  return {
    people: input.team.counts.ACTIVE + input.team.counts.READY_TO_CLOSE + input.team.counts.NOT_STARTED,
    working: input.team.counts.ACTIVE + input.team.counts.READY_TO_CLOSE,
    behind: input.team.counts.AT_RISK + input.team.counts.CRITICAL,
    onLeave: input.plan.profiles.filter((profile) => profile.primaryAvailability === 'ON_LEAVE').length,
    repliesWaiting: input.team.totals.repliesWaiting,
    overdueTasks: 0,
    unassignedProfiles: input.canonical.unassigned.length,
    unacknowledged: input.profiles.filter((profile) => profile.pendingAcknowledgementRepIds.length > 0).length,
    target: input.targets.reduce((sum, row) => sum + row.target, 0),
    completed: input.targets.reduce((sum, row) => sum + row.completed, 0),
    remaining: input.targets.reduce((sum, row) => sum + row.remaining, 0),
    coverage,
  }
}

export function deriveCommandCenter(input: CommandCenterInput): CommandCenterData {
  const targets = buildCommandTargets(input.progress, input.repNameById)
  const summary = deriveCommandSummary({
    team: input.team,
    plan: input.plan,
    canonical: input.canonical,
    targets,
    profiles: input.profiles,
  })
  // Overdue tasks come from the People directory, not Team Day (which has no
  // per-rep overdue counter), so the summary reflects the same source as the
  // People page.
  summary.overdueTasks = input.directory.rows.reduce((sum, row) => sum + row.overdueTasks, 0)
  summary.onLeave = input.directory.rows.filter((row) => row.availability === 'ON_LEAVE').length
  summary.people = input.directory.rows.length
  return {
    businessDate: input.businessDate,
    timezone: input.timezone,
    isWorkingDay: input.isWorkingDay,
    summary,
    actions: buildCommandActions({
      plan: input.plan,
      canonical: input.canonical,
      directory: input.directory,
      targets,
      profiles: input.profiles,
    }),
    matrix: buildCommandMatrix({
      directory: input.directory,
      canonical: input.canonical,
      progress: input.progress,
    }),
    targets,
    coverage: input.plan,
    profiles: input.profiles,
    timeline: input.timeline,
  }
}

/** Coverage profile names by id — used by the page for drilldown labels. */
export function coverageProfileName(plan: CoveragePlan, profileId: string): string | null {
  return plan.profiles.find((profile: CoverageProfileResult) => profile.profileId === profileId)?.name ?? null
}
