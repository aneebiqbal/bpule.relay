import type { ActivityType, DailyTarget, IdentityAssignment, Rep, RevenueIdentity } from '@/lib/domain/types'
import { defaultTargetsForChannel, missingDefaultActivities, type DefaultDailyTarget } from './default-targets'

export interface PersonTargetActivity {
  id: string
  activityType: ActivityType
  targetCount: number
  active: boolean
}

export interface PersonTargetLane {
  identityId: string
  identityName: string
  channel: RevenueIdentity['channel']
  assigned: boolean
  activities: PersonTargetActivity[]
  actionsPerDay: number
  missing: DefaultDailyTarget[]
}

export interface PersonTargetRow {
  repId: string
  repName: string
  lanes: PersonTargetLane[]
  totalActionsPerDay: number
  packComplete: boolean
}

export interface TeamTargetOverview {
  people: PersonTargetRow[]
  peopleCovered: number
  identityLanes: number
  activeTargets: number
  totalActionsPerDay: number
  missingPacks: number
}

export function buildTeamTargetOverview(input: {
  reps: Pick<Rep, 'id' | 'name'>[]
  identities: Array<Pick<RevenueIdentity, 'id' | 'identityName' | 'channel' | 'status'>>
  assignments: Array<Pick<IdentityAssignment, 'repId' | 'revenueIdentityId'>>
  targets: DailyTarget[]
}): TeamTargetOverview {
  const repsById = new Map(input.reps.map((rep) => [rep.id, rep]))
  const identitiesById = new Map(input.identities.map((identity) => [identity.id, identity]))
  const visibleIdentities = input.identities.filter((identity) => identity.status !== 'archived')

  const lanesByRep = new Map<string, Map<string, PersonTargetLane>>()

  function laneFor(repId: string, identityId: string): PersonTargetLane | null {
    const identity = identitiesById.get(identityId)
    if (!identity || identity.status === 'archived') return null
    let byIdentity = lanesByRep.get(repId)
    if (!byIdentity) {
      byIdentity = new Map()
      lanesByRep.set(repId, byIdentity)
    }
    const existing = byIdentity.get(identityId)
    if (existing) return existing
    const lane: PersonTargetLane = {
      identityId,
      identityName: identity.identityName,
      channel: identity.channel,
      assigned: false,
      activities: [],
      actionsPerDay: 0,
      missing: defaultTargetsForChannel(identity.channel),
    }
    byIdentity.set(identityId, lane)
    return lane
  }

  for (const assignment of input.assignments) {
    const lane = laneFor(assignment.repId, assignment.revenueIdentityId)
    if (lane) lane.assigned = true
  }

  for (const target of input.targets) {
    const lane = laneFor(target.repId, target.revenueIdentityId)
    if (!lane) continue
    lane.activities.push({
      id: target.id,
      activityType: target.activityType,
      targetCount: target.targetCount,
      active: target.active,
    })
  }

  const people: PersonTargetRow[] = []
  for (const [repId, byIdentity] of lanesByRep.entries()) {
    const lanes = [...byIdentity.values()].map((lane) => {
      const actionsPerDay = lane.activities
        .filter((activity) => activity.active)
        .reduce((sum, activity) => sum + activity.targetCount, 0)
      return {
        ...lane,
        actionsPerDay,
        missing: missingDefaultActivities(lane.channel, lane.activities),
      }
    })
    people.push({
      repId,
      repName: repsById.get(repId)?.name ?? 'Unknown',
      lanes,
      totalActionsPerDay: lanes.reduce((sum, lane) => sum + lane.actionsPerDay, 0),
      packComplete: lanes.every((lane) => lane.missing.length === 0),
    })
  }

  people.sort((a, b) => a.repName.localeCompare(b.repName))

  const activeTargets = input.targets.filter((target) => target.active && identitiesById.get(target.revenueIdentityId)?.status !== 'archived')
  const missingPacks = people.reduce(
    (sum, person) => sum + person.lanes.filter((lane) => lane.assigned && lane.missing.length > 0).length,
    0,
  )

  return {
    people,
    peopleCovered: people.length,
    identityLanes: visibleIdentities.length,
    activeTargets: activeTargets.length,
    totalActionsPerDay: activeTargets.reduce((sum, target) => sum + target.targetCount, 0),
    missingPacks,
  }
}
