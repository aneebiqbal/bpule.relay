import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseDbClient } from '@/lib/db/supabase'
import { neonServiceDbClient } from '@/lib/db/neon'
import { postgresServiceDbClient } from '@/lib/db/postgres'
import { resolveDbProvider } from '@/lib/db/types'
import type { DbClient } from '@/lib/db/types'

/**
 * Service-role Supabase client. Bypasses RLS entirely — never expose this to
 * a route that serves a browser request. Scoped to system actions that
 * genuinely have no signed-in rep to bind a session to: the off-peak
 * scheduled jobs (eval harness run, few-shot pool refresh), gated by
 * requireCronSecret() below, never by rep auth.
 *
 * Returns the canonical database client so scheduled jobs follow
 * RELAY_DB_PROVIDER. Under the Neon provider no identity is put in scope,
 * which keeps the RLS bypass.
 */
export function createServiceSupabase(): DbClient {
  const provider = resolveDbProvider()
  if (provider === 'neon') {
    return neonServiceDbClient()
  }
  if (provider === 'postgres') {
    return postgresServiceDbClient()
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for scheduled jobs.',
    )
  }
  const client: SupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return supabaseDbClient(client)
}

/**
 * The raw service-role Supabase client, for the two capabilities the canonical
 * adapter does not cover: the Auth admin API (`auth.admin.*`) and Storage.
 * Neon Auth and Neon Object Storage are separate migrations — until they land,
 * these stay on Supabase. Never expose to a browser request.
 */
export function createServiceSupabaseAuth(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for auth-admin operations.',
    )
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Verifies the request actually came from Vercel Cron (or a manual trigger
 * that knows the secret), never from a browser. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` on every scheduled invocation when
 * CRON_SECRET is set; this is the only auth a cron-triggered route gets,
 * since there is no rep session to check.
 */
export function requireCronSecret(request: Request): { ok: true } | { ok: false; status: number } {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Refuse to run rather than silently allow an unauthenticated system
    // action just because the operator forgot to set the secret.
    return { ok: false, status: 500 }
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401 }
  }
  return { ok: true }
}
