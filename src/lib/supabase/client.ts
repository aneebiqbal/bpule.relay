import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browser: SupabaseClient | null = null

/** Browser-side client used only by the login page. */
export function getBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase env vars are not configured (see .env.local.example)')
  }
  if (!browser) {
    browser = createBrowserClient(url, anonKey, {
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : process.env.NODE_ENV === 'production',
      },
    })
  }
  return browser
}
