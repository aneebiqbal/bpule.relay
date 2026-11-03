/**
 * Permission-aware lead list scope.
 *
 * Rep: own / profile-scoped book (never team, never org).
 * Manager: personal profile OR managed-team owners — never org-wide.
 * Admin/Owner: organization.
 */
import type { AuthContext } from '@/lib/auth/organization'

export type LeadListScopeMode = 'profile' | 'team' | 'org'

export function resolveLeadListScope(input: {
  auth: AuthContext | null
  isProductAdmin: boolean
  requested?: string | null
}): { mode: LeadListScopeMode; teamOwnerIds: string[] | null } {
  if (input.isProductAdmin || input.auth?.isOwner || input.auth?.isAdmin) {
    return { mode: 'org', teamOwnerIds: null }
  }

  const wantsTeam = input.requested === 'team'
  const isManager = Boolean(input.auth?.isManager && (input.auth.managedTeamIds?.length ?? 0) > 0)
  if (wantsTeam && isManager) {
    // Caller must fill teamOwnerIds from memberships; null here means "resolve later".
    return { mode: 'team', teamOwnerIds: null }
  }

  return { mode: 'profile', teamOwnerIds: null }
}

/** Pure filter used by fixtures — managers never see owners outside the managed set. */
export function filterLeadsByTeamOwners<T extends { ownerRepId?: string | null }>(
  leads: readonly T[],
  ownerIds: ReadonlySet<string>,
  selfRepId: string,
): T[] {
  return leads.filter((lead) => {
    const owner = lead.ownerRepId
    if (!owner) return false
    return owner === selfRepId || ownerIds.has(owner)
  })
}

export function assertRepCannotUseTeamScope(mode: LeadListScopeMode, isManager: boolean): LeadListScopeMode {
  if (mode === 'team' && !isManager) return 'profile'
  return mode
}
