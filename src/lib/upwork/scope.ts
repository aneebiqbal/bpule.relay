/**
 * Canonical Upwork scope — one resolver for every role.
 *
 * The store loads identities through this, so the rep page, admin page and
 * job detail can never disagree about who may see or operate what.
 */

export interface UpworkIdentityInput {
  repId: string
  revenueIdentityId: string
  profileId: string | null
  channel: string
  /** `assigned` = primary ownership; `coverage` = active temporary cover. */
  access: 'assigned' | 'coverage'
  status: 'active' | 'archived'
}

export interface UpworkScopeInput {
  viewerRepId: string
  isAdmin: boolean
  isManager: boolean
  /** Manager's managed reps; null means "all reps" (admin/owner). */
  managedRepIds: string[] | null
  identities: readonly UpworkIdentityInput[]
}

export interface UpworkScope {
  /** null = whole organization. */
  repIds: string[] | null
  identityIds: string[]
  profileIds: string[]
}

/** Executable = active Upwork identity on a primary assignment or active cover, with a sender profile. */
export function isExecutableUpworkIdentity(identity: UpworkIdentityInput): boolean {
  return (
    identity.channel === 'upwork'
    && identity.status === 'active'
    && Boolean(identity.profileId)
    && (identity.access === 'assigned' || identity.access === 'coverage')
  )
}

export function resolveUpworkScope(input: UpworkScopeInput): UpworkScope {
  const { viewerRepId, isAdmin, isManager, managedRepIds, identities } = input

  let repIds: string[] | null
  if (isAdmin) {
    repIds = null
  } else if (isManager && managedRepIds) {
    repIds = [...managedRepIds]
  } else {
    repIds = [viewerRepId]
  }

  const allowed = repIds === null ? identities : identities.filter((i) => repIds!.includes(i.repId))
  const executable = allowed.filter(isExecutableUpworkIdentity)

  return {
    repIds,
    identityIds: executable.map((i) => i.revenueIdentityId),
    profileIds: executable.map((i) => i.profileId).filter((p): p is string => Boolean(p)),
  }
}
