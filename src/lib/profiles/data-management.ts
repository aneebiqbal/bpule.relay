import type { DbClient } from '@/lib/db/types'

/**
 * Safe data management: duplicate candidates, dependency inspection and
 * deletion eligibility.
 *
 * Nothing here merges or cascades. Deletion is only allowed when every
 * protected reference count is zero, and the decision is recomputed server-side
 * at the moment of the request.
 */

export interface DuplicateCandidate {
  identityName: string
  channel: string
  identities: Array<{ id: string; profileId: string | null; status: string | null }>
}

export interface DependencyReport {
  identityId: string
  counts: {
    assignments: number
    leads: number
    messages: number
    tasks: number
    targets: number
    knowledge: number
    audit: number
  }
  protected: boolean
  blockers: string[]
}

const PROTECTED_TABLES = [
  ['assignments', 'identity_assignments', 'revenue_identity_id'],
  ['leads', 'leads', 'sender_profile_id'],
  ['messages', 'messages', 'sender_profile_id'],
  ['tasks', 'assigned_tasks', 'profile_id'],
  ['targets', 'daily_target_plans', 'revenue_identity_id'],
  ['knowledge', 'profile_experience', 'profile_id'],
  ['audit', 'accountability_audit_log', 'revenue_identity_id'],
] as const

export async function findDuplicateCandidates(client: DbClient, orgId: string): Promise<DuplicateCandidate[]> {
  const { data, error } = await client
    .from('revenue_identities')
    .select('id, profile_id, identity_name, channel, status')
    .eq('organization_id', orgId)
    .limit(5000)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; profile_id: string | null; identity_name: string; channel: string; status: string | null }>

  const groups = new Map<string, DuplicateCandidate>()
  for (const row of rows) {
    const key = `${(row.identity_name ?? '').trim().toLowerCase()}|${(row.channel ?? '').trim().toLowerCase()}`
    const group = groups.get(key) ?? {
      identityName: row.identity_name,
      channel: row.channel,
      identities: [],
    }
    group.identities.push({ id: row.id, profileId: row.profile_id, status: row.status })
    groups.set(key, group)
  }
  return [...groups.values()].filter((group) => group.identities.length > 1)
}

export async function inspectIdentityDependencies(
  client: DbClient,
  orgId: string,
  identityId: string,
): Promise<DependencyReport> {
  const counts = {
    assignments: 0,
    leads: 0,
    messages: 0,
    tasks: 0,
    targets: 0,
    knowledge: 0,
    audit: 0,
  } as DependencyReport['counts']

  for (const [key, table, column] of PROTECTED_TABLES) {
    const { count, error } = await client
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq(column as string, identityId)
    if (error) throw error
    counts[key] = count ?? 0
  }

  const blockers = (Object.keys(counts) as Array<keyof typeof counts>).filter((key) => counts[key] > 0)
  return { identityId, counts, protected: blockers.length > 0, blockers }
}

/**
 * Permanently delete an identity only when nothing references it. Returns the
 * report either way — a protected record is never deleted.
 */
export async function deleteIdentityIfEligible(
  client: DbClient,
  orgId: string,
  identityId: string,
  actorRepId: string,
): Promise<{ ok: boolean; report: DependencyReport; deleted: boolean }> {
  const report = await inspectIdentityDependencies(client, orgId, identityId)
  if (report.protected) return { ok: false, report, deleted: false }

  const { error } = await client
    .from('revenue_identities')
    .delete()
    .eq('id', identityId)
    .eq('organization_id', orgId)
  if (error) throw error

  await client.from('accountability_audit_log').insert({
    organization_id: orgId,
    rep_id: actorRepId,
    revenue_identity_id: identityId,
    event_type: 'identity_deleted',
    detail: { reason: 'no protected dependencies' },
  })
  return { ok: true, report, deleted: true }
}
