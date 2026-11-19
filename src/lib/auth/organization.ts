import { cache } from 'react'
import { getCurrentUser, AuthDatabaseError } from './current'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { isDemoMode } from '@/lib/ai/config'
import { getDbClient } from '@/lib/db/provider'
import { perfTrace } from '@/lib/perf-trace'
import { requestMemo } from '@/lib/request-scope'

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER'
export type TeamRole = 'MANAGER' | 'MEMBER'

export interface TeamMembership {
  teamId: string
  teamName: string
  role: TeamRole
  active: boolean
}

export interface AuthContext {
  repId: string
  orgId: string
  orgName: string
  organizationRole: OrganizationRole
  teamMemberships: TeamMembership[]
  managedTeamIds: string[]
  memberTeamIds: string[]
  capabilities: Set<string>
  isOwner: boolean
  isAdmin: boolean
  isManager: boolean
  isMember: boolean
}

async function resolveAuthContext(): Promise<AuthContext | null> {
  const user = await getCurrentUser()
  if (!user) return null

  if (isDemoMode()) {
    const demoRole: OrganizationRole = user.rep.role === 'admin' ? 'OWNER' : 'MEMBER'
    const demoCapabilities = new Set<string>(
      demoRole === 'OWNER'
        ? ['MANAGE_TEAM_MEMBERS', 'VIEW_TEAM_WORK', 'ASSIGN_TEAM_WORK', 'MANAGE_TEAM_TARGETS', 'VIEW_TEAM_ANALYTICS', 'MANAGE_REVENUE_IDENTITIES', 'MANAGE_ORG_USERS', 'MANAGE_ORG_SETTINGS', 'ACCESS_REVENUE_INTELLIGENCE', 'ACCESS_RELAY_GROWTH']
        : ['VIEW_OWN_WORK', 'EXECUTE_OWN_WORK'],
    )
    return {
      repId: user.rep.id,
      orgId: user.organization.id,
      orgName: user.organization.name,
      organizationRole: demoRole,
      teamMemberships: [],
      managedTeamIds: [],
      memberTeamIds: [],
      capabilities: demoCapabilities,
      isOwner: demoRole === 'OWNER',
      isAdmin: demoRole === 'OWNER',
      isManager: demoRole === 'OWNER',
      isMember: true,
    }
  }

  // Reuse the already-resolved auth user id instead of asking the auth provider
  // for the session a second time (one less round trip on every request).
  const supabase = await getDbClient(user.authUserId)

  // Org role and team memberships are independent; run them together. The
  // capability set depends on the role, so it is the only second wave.
  const [orgRoleRes, membershipRes] = await perfTrace(
    'auth.orgRole+memberships',
    () =>
      Promise.all([
        supabase
          .from('organization_roles')
          .select('role')
          .eq('organization_id', user.organization.id)
          .eq('person_id', user.rep.id)
          .maybeSingle(),
        supabase
          .from('team_memberships')
          .select('team_id, membership_role, active')
          .eq('person_id', user.rep.id)
          .eq('active', true),
      ]),
  )
  // Authorization reads must never silently degrade: a failed role or
  // membership lookup would otherwise fall back to a weaker role/capability
  // set. Surface the database failure as a 500 instead.
  if (orgRoleRes.error && !isMissingRelation(orgRoleRes.error)) {
    throw new AuthDatabaseError('organization_roles lookup failed', orgRoleRes.error)
  }
  if (membershipRes.error && !isMissingRelation(membershipRes.error)) {
    throw new AuthDatabaseError('team_memberships lookup failed', membershipRes.error)
  }
  const orgRoleRow = orgRoleRes.data
  const membershipRows = membershipRes.data

  // organization_roles is the canonical source of truth for org-level access.
  // reps.role is used only as a bootstrap fallback when no org role row exists
  // (e.g., during initial migration or for legacy accounts). If a row exists,
  // it always wins — never let stale reps.role escalate a demoted user.
  const tableRole = orgRoleRow?.role as OrganizationRole | undefined
  const organizationRole: OrganizationRole =
    tableRole ?? (user.rep.role === 'admin' ? 'ADMIN' : 'MEMBER')

  // The team name is a second read rather than a PostgREST embed (`teams!inner`),
  // which the Neon adapter cannot translate. Batched by id, so it stays one
  // round trip regardless of how many teams the rep belongs to.
  const teamIds = (membershipRows ?? []).map((m: { team_id: string }) => m.team_id)
  const teamNameById = new Map<string, string>()
  if (teamIds.length > 0) {
    const teamRes = await perfTrace('auth.teams', () =>
      supabase
        .from('teams')
        .select('id, name')
        .in('id', teamIds),
    )
    if (teamRes.error && !isMissingRelation(teamRes.error)) {
      throw new AuthDatabaseError('teams lookup failed', teamRes.error)
    }
    for (const row of teamRes.data ?? []) {
      teamNameById.set(row.id, row.name)
    }
  }

  const teamMemberships: TeamMembership[] = (membershipRows ?? []).map((m: { team_id: string; membership_role: string; active: boolean }) => ({
    teamId: m.team_id,
    teamName: teamNameById.get(m.team_id) ?? 'Unknown',
    role: m.membership_role as TeamRole,
    active: m.active,
  }))

  const managedTeamIds = teamMemberships
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.teamId)

  const memberTeamIds = teamMemberships
    .filter((m) => m.role === 'MEMBER')
    .map((m) => m.teamId)

  const capabilityRes = await perfTrace('auth.capabilities', () =>
    supabase
      .from('capabilities')
      .select('capability')
      .eq('organization_id', user.organization.id)
      .eq('role', organizationRole)
      .eq('granted', true),
  )
  if (capabilityRes.error && !isMissingRelation(capabilityRes.error)) {
    throw new AuthDatabaseError('capabilities lookup failed', capabilityRes.error)
  }

  const capabilities = new Set((capabilityRes.data ?? []).map((c) => c.capability))

  return {
    repId: user.rep.id,
    orgId: user.organization.id,
    orgName: user.organization.name,
    organizationRole,
    teamMemberships,
    managedTeamIds,
    memberTeamIds,
    capabilities,
    isOwner: organizationRole === 'OWNER',
    isAdmin: organizationRole === 'OWNER' || organizationRole === 'ADMIN',
    isManager: organizationRole === 'OWNER' || organizationRole === 'ADMIN' || managedTeamIds.length > 0,
    isMember: true,
  }
}

export const getAuthContext = cache(() => requestMemo('auth.context', () => resolveAuthContext()))

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) {
    throw new Error('Not authenticated')
  }
  return ctx
}

export function can(ctx: AuthContext, capability: string): boolean {
  if (ctx.isOwner || ctx.isAdmin) return true
  return ctx.capabilities.has(capability)
}

export function canViewTeamWork(ctx: AuthContext, teamId: string): boolean {
  if (ctx.isOwner || ctx.isAdmin) return true
  return ctx.managedTeamIds.includes(teamId) || ctx.memberTeamIds.includes(teamId)
}

export function canManageTeam(ctx: AuthContext, teamId: string): boolean {
  if (ctx.isOwner || ctx.isAdmin) return true
  return ctx.managedTeamIds.includes(teamId)
}

export function canAssignWork(ctx: AuthContext, targetRepId: string): boolean {
  if (ctx.isOwner || ctx.isAdmin) return true
  if (ctx.managedTeamIds.length === 0) return false
  return true
}

export function getVisibleRepIds(ctx: AuthContext, allRepIds: string[]): string[] {
  if (ctx.isOwner || ctx.isAdmin) return allRepIds
  return allRepIds.filter((id) => id === ctx.repId)
}

export function canAccessOwnWork(ctx: AuthContext): boolean {
  return true
}
