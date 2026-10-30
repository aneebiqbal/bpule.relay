/**
 * A ScoutStore for callers that have no signed-in request.
 *
 * `createScoutStore()` throws without a session, but the scheduler and the
 * approval worker act on behalf of a rep. This builds the same store from the
 * rep and organization rows, so those callers use one store implementation
 * rather than a second, divergent one.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { ScoutStore } from '@/lib/store/types'
import type { Organization, Rep } from '@/lib/domain/types'

export async function createStoreForRep(
  client: SupabaseClient,
  organizationId: string,
  repId: string,
): Promise<ScoutStore> {
  const [repResult, orgResult] = await Promise.all([
    client.from('reps').select('id, name, role, timezone').eq('organization_id', organizationId).eq('id', repId).maybeSingle(),
    client.from('organizations').select('id, name, timezone').eq('id', organizationId).maybeSingle(),
  ])

  if (repResult.error) throw repResult.error
  if (orgResult.error) throw orgResult.error

  const repRow = repResult.data as Record<string, unknown> | null
  const orgRow = orgResult.data as Record<string, unknown> | null
  if (!repRow || !orgRow) throw new Error('REP_OR_ORGANIZATION_NOT_FOUND')

  const timezone = (repRow.timezone as string) ?? (orgRow.timezone as string) ?? 'UTC'
  const nowIso = new Date().toISOString()

  const rep: Rep = {
    id: repRow.id as string,
    name: (repRow.name as string) ?? 'Rep',
    role: (repRow.role as Rep['role']) ?? 'rep',
    organizationId,
    createdAt: nowIso,
    timezone,
  }

  const organization: Organization = {
    id: orgRow.id as string,
    name: (orgRow.name as string) ?? 'Organization',
    plan: 'trial',
    billingCustomerId: null,
    timezone: (orgRow.timezone as string) ?? 'UTC',
    workingDays: [1, 2, 3, 4, 5],
    holidays: [],
    createdAt: nowIso,
  }

  return new SupabaseStore(rep, client, organization)
}
