import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { supabaseDbClient } from '@/lib/db/supabase'
import { neonDbClient } from '@/lib/db/neon'
import { postgresDbClient } from '@/lib/db/postgres'
import { resolveDbProvider } from '@/lib/db/types'
import type { DbClient } from '@/lib/db/types'

/**
 * Builds the per-request Supabase client that carries the signed-in user's
 * cookie session. RLS applies to anything run through it, and no service role
 * key ever reaches the browser.
 *
 * `createServerSupabase()` returns the canonical database client, so DB work
 * follows `RELAY_DB_PROVIDER`. Auth-only callers (`supabase.auth.getUser()`)
 * use `getSupabaseAuthClient()`, which is the same client but typed for auth.
 */
async function buildSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase env vars are not configured (see .env.local.example)')
  }

  const store = await cookies()

  return createServerClient(url, anonKey, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(cookieList) {
        try {
          for (const { name, value, options } of cookieList) {
            store.set(name, value, options)
          }
        } catch {
          // Setting cookies is not allowed from Server Components. The session
          // refresh still succeeds; cookie writes are handled by the proxy.
        }
      },
    },
  })
}

const cachedClient = cache(buildSupabase)

/** The raw Supabase client — use for auth only. */
export const getSupabaseAuthClient = cachedClient

/**
 * The canonical database client for the active provider.
 *
 * Supabase: the per-request user-scoped client (unchanged behaviour).
 * Neon: a client bound to the signed-in user's id, which carries the RLS
 * identity in `app.current_user_id` on every query.
 *
 * The identity comes from the auth provider, never from `supabase.auth` — on
 * the Neon provider there is no Supabase session to read.
 */
export const createServerSupabase = cache(async (): Promise<DbClient> => {
  const supabase = await cachedClient()
  const provider = resolveDbProvider()
  if (provider === 'neon' || provider === 'postgres') {
    const { getAuthProvider } = await import('@/lib/auth/provider')
    const { user } = await (await getAuthProvider()).getSession()
    if (!user?.id) throw new Error(`No signed-in user id for the ${provider} database provider`)
    return provider === 'postgres' ? postgresDbClient(user.id) : neonDbClient(user.id)
  }
  return supabaseDbClient(supabase)
})
