import type { DbClient } from '@/lib/db/types'
/**
 * Team directory + team structure (Phase 8.1 / 8.9).
 *
 * One row contract: Manager Home's `assembleManagerHomeTeamData` over
 * `loadTeamDay` + `loadTeamLive` + overdue assigned tasks. This module only
 * adds the directory columns (role, team, open leads) and team roll-ups — it
 * computes no status, pace or attention of its own.
 */
import type { AuthContext } from '@/lib/auth/organization'
import { loadTeamDay, type TeamDaySummary } from '@/lib/rep-day/team'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import type { TeamLivePayload } from '@/lib/admin/team-live'
import {
  assembleManagerHomeTeamData,
  filterTeamLiveToRepIds,
  type ManagerTeamRow,
} from '@/lib/team/manager-home-summary'
import type { AttentionSignal } from '@/lib/team/attention-policy'
import { countOverdueAssignedByRep } from '@/lib/tasks/assigned-tasks'
import { businessDateRange } from '@/lib/org-clock'
import { loadOutcomeEventCounts } from '@/lib/operations/outcome-events'
import { isMissingRelation } from '@/lib/operations/db-errors'
import type { OperationalScope } from '@/lib/operations/scope'

export interface TeamRef {
  id: string
  name: string
}

export interface PeopleRow extends ManagerTeamRow {
  roleLabel: string
  teams: TeamRef[]
  openLeads: number
  lastActivityAt: string | null
  dayState: string | null
}

export interface TeamSummary {
  id: string
  name: string
  description: string | null
  managers: Array<{ repId: string; name: string }>
  memberIds: string[]
  memberCount: number
  activeLeads: number
  repliesWaiting: number
  overdueTasks: number
  meetings: number
  needsAttention: number
}

export interface PeopleDirectory {
  rows: PeopleRow[]
  teams: TeamSummary[]
  attention: AttentionSignal[]
  businessDate: string
}

export interface MembershipRow {
  team_id: string
  person_id: string
  membership_role: 'MANAGER' | 'MEMBER'
}

const ORG_ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  MEMBER: 'Rep',
}

const REP_ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  rep: 'Rep',
  sourcer: 'Sourcer',
}

/** Org role wins; a team MANAGER membership upgrades a MEMBER to Manager. */
export function roleLabelFor(input: {
  orgRole: string | null | undefined
  repRole: string | null | undefined
  managesATeam: boolean
}): string {
  if (input.orgRole && input.orgRole !== 'MEMBER') return ORG_ROLE_LABEL[input.orgRole] ?? input.orgRole
  if (input.managesATeam) return 'Manager'
  if (input.orgRole === 'MEMBER') return 'Rep'
  return REP_ROLE_LABEL[input.repRole ?? ''] ?? 'Rep'
}

/** Pure: directory rows + team roll-ups from already-scoped inputs. */
export function assemblePeopleDirectory(input: {
  teamDay: TeamDaySummary
  teamLive: TeamLivePayload
  allowedRepIds: Set<string>
  overdueTasksByRep: Map<string, number>
  outcomeEventsByRep?: Map<string, { meetings: number; wins: number }>
  teams: Array<{ id: string; name: string; description: string | null }>
  memberships: MembershipRow[]
  orgRoles: Map<string, string>
}): PeopleDirectory {
  const base = assembleManagerHomeTeamData({
    teamName: 'Team',
    teamDay: input.teamDay,
    teamLive: input.teamLive,
    allowedRepIds: input.allowedRepIds,
    overdueTasksByRep: input.overdueTasksByRep,
    outcomeEventsByRep: input.outcomeEventsByRep,
  })

  const teamById = new Map(input.teams.map((t) => [t.id, t]))
  const teamsByRep = new Map<string, TeamRef[]>()
  const managesByRep = new Set<string>()
  for (const m of input.memberships) {
    const team = teamById.get(m.team_id)
    if (!team) continue
    const list = teamsByRep.get(m.person_id) ?? []
    if (!list.some((t) => t.id === team.id)) list.push({ id: team.id, name: team.name })
    teamsByRep.set(m.person_id, list)
    if (m.membership_role === 'MANAGER') managesByRep.add(m.person_id)
  }

  const liveByRep = new Map(input.teamLive.people.map((p) => [p.repId, p]))
  const dayByRep = new Map(input.teamDay.reps.map((r) => [r.repId, r]))

  const rows: PeopleRow[] = base.rows.map((row) => {
    const live = liveByRep.get(row.repId)
    const day = dayByRep.get(row.repId)
    return {
      ...row,
      roleLabel: roleLabelFor({
        orgRole: input.orgRoles.get(row.repId),
        repRole: day?.repRole ?? live?.role,
        managesATeam: managesByRep.has(row.repId),
      }),
      teams: (teamsByRep.get(row.repId) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      openLeads: live?.openLeadCount ?? 0,
      lastActivityAt: day?.lastActivityAt ?? live?.lastActivityAt ?? null,
      dayState: day?.state ?? null,
    }
  })

  const rowByRep = new Map(rows.map((r) => [r.repId, r]))
  const attentionReps = new Set(base.attention.map((a) => a.repId))
  const teams: TeamSummary[] = input.teams
    .map((team) => {
      const members = input.memberships.filter((m) => m.team_id === team.id)
      const memberIds = [...new Set(members.map((m) => m.person_id))]
      const visible = memberIds.map((id) => rowByRep.get(id)).filter(Boolean) as PeopleRow[]
      return {
        id: team.id,
        name: team.name,
        description: team.description,
        managers: members
          .filter((m) => m.membership_role === 'MANAGER')
          .map((m) => ({ repId: m.person_id, name: rowByRep.get(m.person_id)?.repName ?? 'Unknown' })),
        memberIds,
        memberCount: memberIds.length,
        activeLeads: visible.reduce((s, r) => s + r.openLeads, 0),
        repliesWaiting: visible.reduce((s, r) => s + r.repliesWaiting, 0),
        overdueTasks: visible.reduce((s, r) => s + r.overdueTasks, 0),
        meetings: visible.reduce((s, r) => s + r.meetings, 0),
        needsAttention: visible.filter((r) => attentionReps.has(r.repId)).length,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return { rows, teams, attention: base.attention, businessDate: input.teamDay.businessDate }
}

/** Server loader. Scope must come from `resolveOperationalScope`. */
export async function loadPeopleDirectory(
  client: DbClient,
  auth: AuthContext,
  scope: OperationalScope,
): Promise<PeopleDirectory> {
  const [teamDay, teamLiveFull, teamsRes, rolesRes] = await Promise.all([
    loadTeamDay(),
    loadTeamLive(auth.orgId),
    client.from('teams').select('id, name, description').eq('organization_id', auth.orgId).eq('status', 'active'),
    client.from('organization_roles').select('person_id, role').eq('organization_id', auth.orgId),
  ])

  const allowed = new Set(
    scope.repIds === null
      ? [...teamDay.reps.map((r) => r.repId), ...teamLiveFull.people.map((p) => p.repId)]
      : scope.repIds,
  )
  const teamLive = filterTeamLiveToRepIds(teamLiveFull, allowed)

  const teams = teamsRes.error ? [] : ((teamsRes.data ?? []) as Array<{ id: string; name: string; description: string | null }>)
  const teamIds = teams.map((t) => t.id)
  const today = businessDateRange(teamDay.businessDate, teamDay.timezone)
  const [membershipRes, overdueTasksByRep, outcomeEvents] = await Promise.all([
    teamIds.length
      ? client
          .from('team_memberships')
          .select('team_id, person_id, membership_role')
          .in('team_id', teamIds)
          .eq('active', true)
      : Promise.resolve({ data: [] as MembershipRow[], error: null }),
    countOverdueAssignedByRep(client, auth.orgId, [...allowed]),
    loadOutcomeEventCounts(client, { orgId: auth.orgId, repIds: [...allowed], start: today.start, end: today.end }),
  ])
  if (membershipRes.error && !isMissingRelation(membershipRes.error)) throw membershipRes.error

  const memberships = ((membershipRes.data ?? []) as MembershipRow[]).filter(
    (m) => scope.repIds === null || allowed.has(m.person_id),
  )
  // Managers see only teams they manage; admins see every org team.
  const visibleTeams =
    scope.mode === 'org' ? teams : teams.filter((t) => auth.managedTeamIds.includes(t.id))

  const orgRoles = new Map(
    ((rolesRes.data ?? []) as Array<{ person_id: string; role: string }>).map((r) => [r.person_id, r.role]),
  )

  return assemblePeopleDirectory({
    teamDay,
    teamLive,
    allowedRepIds: allowed,
    overdueTasksByRep,
    outcomeEventsByRep: outcomeEvents.byActor,
    teams: visibleTeams,
    memberships,
    orgRoles,
  })
}
