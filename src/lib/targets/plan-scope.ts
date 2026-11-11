/**
 * Channel-plan scope helpers.
 *
 * The daily requirement belongs to a channel identity, never to an operator.
 * Consumers that still think in terms of "the rep's target" resolve the current
 * operator through the profile's active PRIMARY. Shared operators contribute to
 * the same plan; they never get a second requirement.
 */
import type { DbClient } from '@/lib/db/types'

/**
 * Map each revenue identity to the rep who currently owns its profile. Used only
 * to project the channel-owned plan onto rep-scoped consumers.
 */
export async function primaryRepByIdentity(
  client: DbClient,
  orgId: string,
  identityIds: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const ids = [...new Set(identityIds)].filter(Boolean)
  if (ids.length === 0) return result

  const { data: identityRows } = await client
    .from('revenue_identities')
    .select('id, profile_id')
    .eq('organization_id', orgId)
    .in('id', ids)
    .limit(500)
  const profileByIdentity = new Map(
    (identityRows ?? []).map((row) => [row.id as string, row.profile_id as string]),
  )
  const profileIds = [...new Set([...profileByIdentity.values()].filter(Boolean))]
  const { data: coverageRows } = profileIds.length > 0
    ? await client
        .from('profile_coverage')
        .select('profile_id, rep_id')
        .eq('organization_id', orgId)
        .eq('active', true)
        .eq('role', 'PRIMARY')
        .in('profile_id', profileIds)
        .limit(500)
    : { data: [] as Array<Record<string, unknown>> }

  const primaryByProfile = new Map(
    (coverageRows ?? []).map((row) => [row.profile_id as string, row.rep_id as string]),
  )
  for (const [identityId, profileId] of profileByIdentity) {
    const repId = primaryByProfile.get(profileId)
    if (repId) result.set(identityId, repId)
  }
  return result
}
