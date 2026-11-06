import type { RevenueIdentityChannel } from '@/lib/domain/types'

/**
 * The daily coverage engine — one deterministic derivation, no AI.
 *
 * For every active profile it answers: who is primary, is the primary
 * available, who the ordered backups are, whether any backup is provably
 * eligible (canonical assignment + channel capability + availability +
 * workload), what the resulting operational status is, and what — if anything
 * — needs an admin's approval.
 *
 * It never mutates ownership. `identity_assignments` remains the eligibility
 * authority; this module only reads it.
 */

export type AvailabilityState =
  | 'AVAILABLE'
  | 'WORKING'
  | 'ON_LEAVE'
  | 'OFFLINE'
  | 'CHECKED_OUT'
  | 'UNAVAILABLE'

export const AVAILABILITY_STATES: AvailabilityState[] = [
  'AVAILABLE',
  'WORKING',
  'ON_LEAVE',
  'OFFLINE',
  'CHECKED_OUT',
  'UNAVAILABLE',
]

export type CoverageStatus = 'COVERED' | 'BACKUP_ACTIVE' | 'AT_RISK' | 'UNCOVERED'
export type CoverageMode = 'AUTO_COVER' | 'APPROVAL_REQUIRED' | 'MANUAL_ONLY'
export type CoverageRecommendation = 'NONE' | 'COVER' | 'RESTORE_PRIMARY' | 'NO_SAFE_COVERAGE'

/** A rep who can do the work right now. */
export const AVAILABLE_FOR_COVERAGE: ReadonlySet<AvailabilityState> = new Set([
  'AVAILABLE',
  'WORKING',
])

export const DEFAULT_MAX_PROFILES_PER_REP = 3

export interface CoverageProfileInput {
  profileId: string
  name: string
  channels: RevenueIdentityChannel[]
  /** Active revenue identities on this profile — the workspace deep link. */
  identityIds: string[]
}

/** Canonical eligibility: a rep's assignment on a profile, and the channels it proves. */
export interface CoverageAssignmentInput {
  profileId: string
  repId: string
  channels: RevenueIdentityChannel[]
}

export interface CoverageConfigInput {
  profileId: string
  repId: string
  role: 'PRIMARY' | 'BACKUP'
  priority: number
}

export interface RepAvailabilityInput {
  repId: string
  state: AvailabilityState
}

export interface RepWorkloadInput {
  repId: string
  name: string
  assignedProfileCount: number
  openCount: number
  replies: number
  followUps: number
  overdue: number
  activeCoverageCount: number
}

export interface ActiveCoverageInput {
  profileId: string
  primaryRepId: string
  coveringRepId: string
  effectiveUntil: string | null
}

export interface ProfileWorkInput {
  replies: number
  followUps: number
  tasks: number
}

export interface CoverageEngineInput {
  businessDate: string
  isWorkingDay: boolean
  coveragePolicy: CoverageMode
  maxProfilesPerRep: number
  profiles: CoverageProfileInput[]
  assignments: CoverageAssignmentInput[]
  coverage: CoverageConfigInput[]
  availability: RepAvailabilityInput[]
  workloads: RepWorkloadInput[]
  activeCoverage: ActiveCoverageInput[]
  readiness: Array<{ profileId: string; repId: string }>
  /** Optional per-profile open work package (canonical Inbox + assigned tasks). */
  profileWork?: Record<string, ProfileWorkInput>
}

export interface BackupCandidate {
  repId: string
  name: string
  priority: number
  availability: AvailabilityState
  eligible: boolean
  reasons: string[]
  missingChannels: RevenueIdentityChannel[]
  assignedProfileCount: number
  activeCoverageCount: number
  openCount: number
  ready: boolean
}

export interface CoverageProfileResult {
  profileId: string
  name: string
  channels: RevenueIdentityChannel[]
  identityIds: string[]
  primaryRepId: string | null
  primaryRepName: string | null
  primaryAvailability: AvailabilityState
  primaryIsAvailable: boolean
  backups: BackupCandidate[]
  activeCoveringRepId: string | null
  activeCoveringRepName: string | null
  activeCoverageUntil: string | null
  status: CoverageStatus
  recommendation: CoverageRecommendation
  recommendedRepId: string | null
  recommendedRepName: string | null
  recommendationReasons: string[]
  recommendedReady: boolean
  ineligibleReason: string | null
  work: ProfileWorkInput
}

export interface CoverageApprovalItem {
  profileId: string
  profileName: string
  channels: RevenueIdentityChannel[]
  fromRepId: string
  fromRepName: string
  toRepId: string
  toRepName: string
  kind: 'COVER' | 'RESTORE_PRIMARY'
  reason: string
  effectiveUntil: string | null
  workPackage: ProfileWorkInput
  readinessRequired: boolean
}

export interface CoveragePlan {
  businessDate: string
  isWorkingDay: boolean
  coveragePolicy: CoverageMode
  totalProfiles: number
  counts: Record<CoverageStatus, number>
  profiles: CoverageProfileResult[]
  /** Exceptions only — everything else is unchanged. */
  requiresApproval: CoverageApprovalItem[]
  unchanged: number
}

const EMPTY_WORK: ProfileWorkInput = { replies: 0, followUps: 0, tasks: 0 }

const EMPTY_COUNTS: Record<CoverageStatus, number> = {
  COVERED: 0,
  BACKUP_ACTIVE: 0,
  AT_RISK: 0,
  UNCOVERED: 0,
}

/** The state a rep with no explicit availability row is treated as. */
export function fallbackAvailability(isWorkingDay: boolean): AvailabilityState {
  return isWorkingDay ? 'AVAILABLE' : 'OFFLINE'
}

function channelLabel(channel: RevenueIdentityChannel): string {
  return channel === 'linkedin' ? 'LinkedIn' : channel === 'upwork' ? 'Upwork' : channel
}

/**
 * Eligibility is proven, never assumed: the backup must hold a canonical
 * assignment on this profile covering every channel the profile supports, be
 * available, and be under the overload ceiling.
 */
export function evaluateBackupEligibility(input: {
  backup: CoverageConfigInput
  profile: CoverageProfileInput
  assignment: CoverageAssignmentInput | undefined
  availability: AvailabilityState
  workload: RepWorkloadInput
  maxProfilesPerRep: number
  ready: boolean
}): { eligible: boolean; reasons: string[]; missingChannels: RevenueIdentityChannel[] } {
  const reasons: string[] = []
  const missingChannels: RevenueIdentityChannel[] = []

  if (!AVAILABLE_FOR_COVERAGE.has(input.availability)) {
    return {
      eligible: false,
      reasons: [`${labelForAvailability(input.availability)} — not available today`],
      missingChannels: [],
    }
  }

  const covered = new Set(input.assignment?.channels ?? [])
  for (const channel of input.profile.channels) {
    if (!covered.has(channel)) missingChannels.push(channel)
  }
  if (missingChannels.length > 0) {
    return {
      eligible: false,
      reasons: [
        `No ${missingChannels.map(channelLabel).join(', ')} access on this profile`,
      ],
      missingChannels,
    }
  }

  const load = input.workload.assignedProfileCount + input.workload.activeCoverageCount
  if (load >= input.maxProfilesPerRep) {
    return {
      eligible: false,
      reasons: [`At capacity — ${load} of ${input.maxProfilesPerRep} profiles`],
      missingChannels,
    }
  }

  reasons.push('Available')
  reasons.push(`${input.profile.channels.map(channelLabel).join(' + ')} access confirmed`)
  reasons.push(
    `${input.workload.assignedProfileCount} active ${input.workload.assignedProfileCount === 1 ? 'profile' : 'profiles'}`,
  )
  const remaining = Math.max(0, input.workload.openCount)
  reasons.push(`${remaining} remaining ${remaining === 1 ? 'action' : 'actions'}`)
  if (!input.ready) reasons.push('Device access not confirmed')

  return { eligible: true, reasons, missingChannels }
}

export function labelForAvailability(state: AvailabilityState): string {
  switch (state) {
    case 'AVAILABLE':
      return 'Available'
    case 'WORKING':
      return 'Working'
    case 'ON_LEAVE':
      return 'On leave'
    case 'OFFLINE':
      return 'Offline'
    case 'CHECKED_OUT':
      return 'Checked out'
    case 'UNAVAILABLE':
      return 'Unavailable'
  }
}

/** Deterministic tie-break: least open work, then fewest profiles, then name. */
export function compareBackupCandidates(a: BackupCandidate, b: BackupCandidate): number {
  if (a.priority !== b.priority) return a.priority - b.priority
  if (a.openCount !== b.openCount) return a.openCount - b.openCount
  if (a.assignedProfileCount !== b.assignedProfileCount) return a.assignedProfileCount - b.assignedProfileCount
  return a.name.localeCompare(b.name)
}

export function evaluateDailyCoverage(input: CoverageEngineInput): CoveragePlan {
  const availabilityByRep = new Map(input.availability.map((row) => [row.repId, row.state]))
  const workloadByRep = new Map(input.workloads.map((row) => [row.repId, row]))
  const activeByProfile = new Map(input.activeCoverage.map((row) => [row.profileId, row]))
  const readyPairs = new Set(input.readiness.map((row) => `${row.profileId}:${row.repId}`))

  const profiles: CoverageProfileResult[] = []
  const requiresApproval: CoverageApprovalItem[] = []

  for (const profile of input.profiles) {
    const config = input.coverage
      .filter((row) => row.profileId === profile.profileId)
      .sort((a, b) => a.priority - b.priority)
    const primary = config.find((row) => row.role === 'PRIMARY') ?? null
    const backupConfig = config.filter((row) => row.role === 'BACKUP')

    const primaryAvailability: AvailabilityState = primary
      ? availabilityByRep.get(primary.repId) ?? fallbackAvailability(input.isWorkingDay)
      : 'UNAVAILABLE'
    const primaryIsAvailable = AVAILABLE_FOR_COVERAGE.has(primaryAvailability)
    const primaryWorkload = primary ? workloadByRep.get(primary.repId) : undefined

    const active = activeByProfile.get(profile.profileId) ?? null

    const backups: BackupCandidate[] = backupConfig.map((backup) => {
      const assignment = input.assignments.find(
        (row) => row.profileId === profile.profileId && row.repId === backup.repId,
      )
      const availability = availabilityByRep.get(backup.repId) ?? fallbackAvailability(input.isWorkingDay)
      const workload = workloadByRep.get(backup.repId) ?? {
        repId: backup.repId,
        name: backup.repId,
        assignedProfileCount: 0,
        openCount: 0,
        followUps: 0,
        replies: 0,
        overdue: 0,
        activeCoverageCount: 0,
      }
      const ready = readyPairs.has(`${profile.profileId}:${backup.repId}`)
      const verdict = evaluateBackupEligibility({
        backup,
        profile,
        assignment,
        availability,
        workload,
        maxProfilesPerRep: input.maxProfilesPerRep,
        ready,
      })
      return {
        repId: backup.repId,
        name: workload.name,
        priority: backup.priority,
        availability,
        eligible: verdict.eligible,
        reasons: verdict.reasons,
        missingChannels: verdict.missingChannels,
        assignedProfileCount: workload.assignedProfileCount,
        activeCoverageCount: workload.activeCoverageCount,
        openCount: workload.openCount,
        ready,
      }
    })

    const eligibleBackups = backups.filter((backup) => backup.eligible).sort(compareBackupCandidates)
    const recommended = eligibleBackups[0] ?? null
    const work = input.profileWork?.[profile.profileId] ?? EMPTY_WORK

    let status: CoverageStatus
    let recommendation: CoverageRecommendation = 'NONE'
    let recommendedRepId: string | null = null
    let recommendedRepName: string | null = null
    let recommendationReasons: string[] = []
    let recommendedReady = true
    let ineligibleReason: string | null = null

    if (!primary) {
      status = 'UNCOVERED'
      ineligibleReason = 'NO_PRIMARY_ASSIGNED'
      recommendation = 'NO_SAFE_COVERAGE'
    } else if (active) {
      // Coverage is already running. If the primary is back, the plan asks to
      // restore them; otherwise the backup continues.
      status = 'BACKUP_ACTIVE'
      if (primaryIsAvailable) {
        recommendation = 'RESTORE_PRIMARY'
        recommendedRepId = primary.repId
        recommendedRepName = primaryWorkload?.name ?? primary.repId
        recommendedReady = readyPairs.has(`${profile.profileId}:${primary.repId}`)
        recommendationReasons = [
          `${recommendedRepName} is ${labelForAvailability(primaryAvailability).toLowerCase()}`,
          `Coverage by ${active.coveringRepId === recommendedRepId ? 'the primary' : 'a backup'} can end`,
        ]
        requiresApproval.push({
          profileId: profile.profileId,
          profileName: profile.name,
          channels: profile.channels,
          fromRepId: active.coveringRepId,
          fromRepName: workloadByRep.get(active.coveringRepId)?.name ?? active.coveringRepId,
          toRepId: primary.repId,
          toRepName: recommendedRepName,
          kind: 'RESTORE_PRIMARY',
          reason: 'Primary rep is available again',
          effectiveUntil: null,
          workPackage: work,
          readinessRequired: !recommendedReady,
        })
      }
    } else if (primaryIsAvailable) {
      status = 'COVERED'
    } else if (recommended) {
      status = 'AT_RISK'
      recommendation = 'COVER'
      recommendedRepId = recommended.repId
      recommendedRepName = recommended.name
      recommendationReasons = recommended.reasons
      recommendedReady = recommended.ready
      requiresApproval.push({
        profileId: profile.profileId,
        profileName: profile.name,
        channels: profile.channels,
        fromRepId: primary.repId,
        fromRepName: primaryWorkload?.name ?? primary.repId,
        toRepId: recommended.repId,
        toRepName: recommended.name,
        kind: 'COVER',
        reason: `${primaryWorkload?.name ?? 'Primary'} is ${labelForAvailability(primaryAvailability).toLowerCase()}`,
        effectiveUntil: null,
        workPackage: work,
        readinessRequired: !recommended.ready,
      })
    } else {
      status = 'UNCOVERED'
      recommendation = 'NO_SAFE_COVERAGE'
      ineligibleReason = backupConfig.length === 0
        ? 'NO_BACKUP_CONFIGURED'
        : 'NO_SAFE_COVERAGE'
    }

    profiles.push({
      profileId: profile.profileId,
      name: profile.name,
      channels: profile.channels,
      identityIds: profile.identityIds,
      primaryRepId: primary?.repId ?? null,
      primaryRepName: primary ? primaryWorkload?.name ?? primary.repId : null,
      primaryAvailability,
      primaryIsAvailable,
      backups,
      activeCoveringRepId: active?.coveringRepId ?? null,
      activeCoveringRepName: active ? workloadByRep.get(active.coveringRepId)?.name ?? active.coveringRepId : null,
      activeCoverageUntil: active?.effectiveUntil ?? null,
      status,
      recommendation,
      recommendedRepId,
      recommendedRepName,
      recommendationReasons,
      recommendedReady,
      ineligibleReason,
      work,
    })
  }

  const counts = { ...EMPTY_COUNTS }
  for (const profile of profiles) counts[profile.status] += 1

  return {
    businessDate: input.businessDate,
    isWorkingDay: input.isWorkingDay,
    coveragePolicy: input.coveragePolicy,
    totalProfiles: profiles.length,
    counts,
    profiles: profiles.sort((a, b) => a.name.localeCompare(b.name)),
    requiresApproval,
    unchanged: counts.COVERED,
  }
}

/**
 * Narrow a plan to the profiles a caller may see (a manager's managed team).
 * Counts and the approval list are recomputed, so a scoped view cannot report
 * organization totals.
 */
export function filterCoveragePlanToReps(plan: CoveragePlan, repIds: Set<string>): CoveragePlan {
  if (repIds.size === 0) {
    return {
      ...plan,
      totalProfiles: 0,
      counts: { ...EMPTY_COUNTS },
      profiles: [],
      requiresApproval: [],
      unchanged: 0,
    }
  }

  const profiles = plan.profiles.filter(
    (profile) =>
      (profile.primaryRepId !== null && repIds.has(profile.primaryRepId)) ||
      (profile.activeCoveringRepId !== null && repIds.has(profile.activeCoveringRepId)) ||
      profile.backups.some((backup) => repIds.has(backup.repId)),
  )
  const profileIds = new Set(profiles.map((profile) => profile.profileId))
  const counts = { ...EMPTY_COUNTS }
  for (const profile of profiles) counts[profile.status] += 1

  return {
    ...plan,
    totalProfiles: profiles.length,
    counts,
    profiles,
    requiresApproval: plan.requiresApproval.filter((item) => profileIds.has(item.profileId)),
    unchanged: counts.COVERED,
  }
}

/** The compact operational status block Admin Home shows. */
export interface CoverageStatusSummary {
  working: number
  onLeave: number
  offline: number
  available: number
  checkedOut: number
  unavailable: number
  covered: number
  backupActive: number
  atRisk: number
  uncovered: number
  requiresApproval: number
}

export function buildCoverageStatusSummary(input: {
  availability: RepAvailabilityInput[]
  plan: CoveragePlan
}): CoverageStatusSummary {
  const counts = { working: 0, onLeave: 0, offline: 0, available: 0, checkedOut: 0, unavailable: 0 }
  for (const row of input.availability) {
    if (row.state === 'WORKING') counts.working += 1
    else if (row.state === 'ON_LEAVE') counts.onLeave += 1
    else if (row.state === 'OFFLINE') counts.offline += 1
    else if (row.state === 'AVAILABLE') counts.available += 1
    else if (row.state === 'CHECKED_OUT') counts.checkedOut += 1
    else counts.unavailable += 1
  }
  return {
    ...counts,
    covered: input.plan.counts.COVERED,
    backupActive: input.plan.counts.BACKUP_ACTIVE,
    atRisk: input.plan.counts.AT_RISK,
    uncovered: input.plan.counts.UNCOVERED,
    requiresApproval: input.plan.requiresApproval.length,
  }
}
