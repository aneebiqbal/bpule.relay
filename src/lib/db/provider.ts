/**
 * Database provider selection.
 *
 * `RELAY_DB_PROVIDER` picks the backend. It defaults to `supabase` so that a
 * deployment that has not opted in behaves exactly as it did before this
 * adapter existed — the Supabase client is still the rollback path.
 *
 *   RELAY_DB_PROVIDER=supabase   (default, rollback)
 *   RELAY_DB_PROVIDER=neon
 */
import { createServerSupabase } from '@/lib/supabase/server'
import { neonDbClient } from './neon'
import { resolveDbProvider, type DbClient, type DbProvider } from './types'

/** The provider this process is running. Read once per request. */
export function currentDbProvider(): DbProvider {
  return resolveDbProvider()
}

/** Whether the Neon provider is active. */
export function isNeonDbProvider(): boolean {
  return resolveDbProvider() === 'neon'
}

/**
 * Builds a database client for the current provider.
 *
 * Supabase: the per-request user-scoped client (unchanged behaviour).
 * Neon: a client bound to the signed-in user's id, which carries the RLS
 * identity in `app.current_user_id` on every query.
 */
export async function getDbClient(userId?: string): Promise<DbClient> {
  const provider = resolveDbProvider()
  if (provider === 'supabase') {
    // createServerSupabase already returns the canonical client.
    return createServerSupabase()
  }
  if (!userId) throw new Error('A signed-in user id is required for the Neon provider')
  return neonDbClient(userId)
}

/** Diagnostics only — never includes a connection string. */
export function describeDbProvider(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return { databaseProvider: resolveDbProvider(env) }
}
