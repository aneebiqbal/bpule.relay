import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from './current'
import { isDemoMode } from '@/lib/ai/config'

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

  const supabase = await createServerSupabase()

  const { data: orgRoleRow } = await supabase
    .from('organization_roles')
    .select('role')
    .eq('organization_id', user.organization.id)
    .eq('person_id', user.rep.id)
    .maybeSingle()

  const tableRole = orgRoleRow?.role as OrganizationRole | undefined
  const organizationRole: OrganizationRole =
    tableRole === 'OWNER' || tableRole === 'ADMIN'
      ? tableRole
      : user.rep.role === 'admin'
        ? 'ADMIN'
        : (tableRole ?? 'MEMBER')

  const { data: memberships } = await supabase
    .from('team_memberships')
    .select('team_id, membership_role, active, teams!inner(name)')
    .eq('person_id', user.rep.id)
    .eq('active', true)

  const teamMemberships: TeamMembership[] = (memberships ?? []).map((m: any) => ({
    teamId: m.team_id,
    teamName: m.teams?.name ?? 'Unknown',
    role: m.membership_role as TeamRole,
    active: m.active,
  }))

  const managedTeamIds = teamMemberships
    .filter((m) => m.role === 'MANAGER')
    .map((m) => m.teamId)

  const memberTeamIds = teamMemberships
    .filter((m) => m.role === 'MEMBER')
    .map((m) => m.teamId)

  const { data: capabilityRows } = await supabase
    .from('capabilities')
    .select('capability')
    .eq('organization_id', user.organization.id)
    .eq('role', organizationRole)
    .eq('granted', true)

  const capabilities = new Set((capabilityRows ?? []).map((c) => c.capability))

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

export const getAuthContext = cache(resolveAuthContext)

export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) {
    throw new Error('Not authenticated')
  }
  return ctx
}

export function can(ctx: AuthContext, capability: string): boolean {
  if (ctx.isOwner) return true
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

  const visible = new Set<string>([ctx.repId])
  for (const m of ctx.teamMemberships) {
    if (m.active) {
      visible.add(ctx.repId)
    }
  }

  return allRepIds.filter((id) => visible.has(id))
}

export function canAccessOwnWork(ctx: AuthContext): boolean {
  return true
}
