import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Creates a per-request Supabase client bound to the signed-in user's cookie
 * session, so Row Level Security applies and no service role key ever touches
 * the browser.
 *
 * Cached for the duration of the request so multiple callers (auth resolution,
 * store construction, RSC pages) reuse one client instead of building several.
 */
export const createServerSupabase = cache(async (): Promise<SupabaseClient> => {
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
})
