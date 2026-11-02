import type { DbClient } from '@/lib/db/types'
/**
 * Operational scope for Phase 8 Team / Accounts surfaces.
 *
 * One authority: `resolveTaskAssigneeScope` (Phase 6). Rep → own, Manager →
 * managed team + self, Admin/Owner → organization. Every loader calls this on
 * the server; a URL rep id outside scope is a 404, never an empty page.
 */
import type { AuthContext } from '@/lib/auth/organization'
import { resolveTaskAssigneeScope } from '@/lib/tasks/assigned-tasks'

export type OperationalScopeMode = 'own' | 'team' | 'org'

export interface OperationalScope {
  mode: OperationalScopeMode
  orgId: string
  actorRepId: string
  /** null = whole organization. */
  repIds: string[] | null
}

export async function resolveOperationalScope(
  client: DbClient,
  auth: AuthContext,
): Promise<OperationalScope> {
  const resolved = await resolveTaskAssigneeScope(client, auth)
  return {
    mode: resolved.mode,
    orgId: auth.orgId,
    actorRepId: auth.repId,
    repIds: resolved.assigneeIds,
  }
}

export function repInScope(scope: OperationalScope, repId: string): boolean {
  if (!repId) return false
  return scope.repIds === null || scope.repIds.includes(repId)
}

/** Narrow a candidate rep list to what the scope allows. */
export function filterRepIdsToScope(scope: OperationalScope, repIds: readonly string[]): string[] {
  if (scope.repIds === null) return [...repIds]
  const allowed = new Set(scope.repIds)
  return repIds.filter((id) => allowed.has(id))
}

/**
 * The rep ids a query should be constrained to, after applying an optional
 * requested rep / team filter. Returns null for "whole org, no constraint".
 * A requested rep outside scope yields [] (nothing), never a widening.
 */
export function effectiveRepIds(
  scope: OperationalScope,
  requested: { repId?: string | null; teamMemberIds?: readonly string[] | null },
): string[] | null {
  let ids: string[] | null = scope.repIds === null ? null : [...scope.repIds]
  if (requested.teamMemberIds) {
    ids = ids === null ? [...requested.teamMemberIds] : filterRepIdsToScope(scope, requested.teamMemberIds)
  }
  if (requested.repId) {
    if (!repInScope(scope, requested.repId)) return []
    if (ids !== null && !ids.includes(requested.repId)) return []
    ids = [requested.repId]
  }
  return ids
}

/** Manager/Admin intervention (assign, request update, reassign) on a rep. */
export function canInterveneOnRep(scope: OperationalScope, repId: string): boolean {
  if (scope.mode === 'own') return false
  return repInScope(scope, repId)
}

/** Team surfaces are for managers and above; reps keep their own Home/Tasks. */
export function canOpenTeamWorkspace(auth: Pick<AuthContext, 'isAdmin' | 'isOwner' | 'isManager'>): boolean {
  return auth.isAdmin || auth.isOwner || auth.isManager
}
