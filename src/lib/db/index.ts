/**
 * Canonical database surface.
 *
 * Application code imports from here, never from a concrete driver. Two
 * providers exist behind the contract:
 *
 *   - `supabase` — the existing PostgREST client (rollback path)
 *   - `neon`     — SQL over Neon Postgres, with RLS identity in a session GUC
 *
 * New code should prefer domain repositories in `src/lib/db/repos/` over
 * reaching for `.from()` directly.
 */
export type {
  CountStrategy,
  DbClient,
  DbError,
  DbProvider,
  DbQueryBuilder,
  DbResult,
  OrderOptions,
  SelectOptions,
  UpsertOptions,
} from './types'

export { currentDbProvider, describeDbProvider, getDbClient, isNeonDbProvider } from './provider'
export { resolveDbProvider } from './types'

export { NeonDbClient, closeNeonPool, getNeonPool, neonDbClient, withNeonSession } from './neon'
export { SupabaseDbClient, supabaseDbClient } from './supabase'
