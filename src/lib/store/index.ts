import { getSupabaseAuthClient } from '@/lib/supabase/server'
import { cache } from 'react'
import type { ScoutStore } from '@/lib/store/types'
import { SupabaseStore } from '@/lib/store/supabase-store'
import { getDemoStore } from '@/lib/store/demo-registry'
import { isDemoMode } from '@/lib/ai/config'
import { getCurrentUser } from '@/lib/auth/current'
import { getDbClient, isNeonDbProvider } from '@/lib/db/provider'

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

  const client = isNeonDbProvider()
    ? await getDbClient(user.authUserId)
    : await getDbClient()
  return new SupabaseStore(
    user.rep,
    client,
    user.organization,
    isNeonDbProvider() ? null : await getSupabaseAuthClient(),
  )
})

export { getCurrentUser }
