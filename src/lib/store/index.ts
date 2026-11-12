import { getSupabaseAuthClient } from '@/lib/supabase/server'
import { cache } from 'react'
import type { ScoutStore } from '@/lib/store/types'
import { SupabaseStore } from '@/lib/store/supabase-store'
import { getDemoStore } from '@/lib/store/demo-registry'
import { isDemoMode } from '@/lib/ai/config'
import { getCurrentUser } from '@/lib/auth/current'
import { currentDbProvider, getDbClient } from '@/lib/db/provider'

/**
 * Request-scoped store. Cached so a layout, page and any nested callers share
 * one database client (and its rulebook/rate caches) instead of rebuilding the
 * store and re-resolving the signed-in rep on every call.
 *
 * The provider is chosen by `RELAY_DB_PROVIDER`:
 *   - `supabase` (default) — the per-request user-scoped PostgREST client
 *   - `neon`              — a client carrying the RLS identity in a session GUC
 */
export const createScoutStore = cache(async (): Promise<ScoutStore> => {
  const user = await getCurrentUser()
  if (!user) throw new Error('No signed-in rep for this request')

  if (isDemoMode()) {
    return getDemoStore(user.rep)
  }

  // Neon and standard Postgres carry the RLS identity in a session GUC, so
  // they need the signed-in user id. Supabase (PostgREST) does not.
  const provider = currentDbProvider()
  const identityBound = provider !== 'supabase'
  const client = identityBound ? await getDbClient(user.authUserId) : await getDbClient()
  return new SupabaseStore(
    user.rep,
    client,
    user.organization,
    // Object storage stays on Supabase until Neon Storage lands.
    provider === 'neon' ? null : await getSupabaseAuthClient(),
  )
})

export { getCurrentUser }
