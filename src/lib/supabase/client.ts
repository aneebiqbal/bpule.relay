import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let browser: SupabaseClient | null = null

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match?.[2]
}

function setCookie(name: string, value: string, options: Record<string, unknown> = {}) {
  let cookie = `${name}=${value}`
  for (const [key, val] of Object.entries(options)) {
    if (val === true) {
      cookie += `; ${key}`
    } else if (val !== false && val != null) {
      cookie += `; ${key}=${val}`
    }
  }
  document.cookie = cookie
}

/** Browser-side client used only by the login page. */
export function getBrowserSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase env vars are not configured (see .env.local.example)')
  }
  if (!browser) {
    browser = createBrowserClient(url, anonKey, {
      cookies: {
        getAll() {
          return document.cookie.split('; ').filter(Boolean).map((cookie) => {
            const [name, ...rest] = cookie.split('=')
            return { name, value: rest.join('=') }
          })
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            setCookie(name, value, options)
          })
        },
      },
    })
  }
  return browser
}