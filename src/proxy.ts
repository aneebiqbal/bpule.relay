import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isDemoMode } from '@/lib/ai/config'

/**
 * Supabase mode only: refreshes the session cookie so middle routes keep the
 * signed-in user. Next.js 16 uses proxy.ts in place of middleware.ts.
 */
export async function proxy(request: NextRequest) {
  if (isDemoMode()) {
    return NextResponse.next({ request })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.next({ request })
  }

  const response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookieList) {
        for (const { name, value, options } of cookieList) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  try {
    await supabase.auth.getUser()
  } catch {
    // Session refresh failed — let the request through. The page will handle
    // unauthenticated state (redirect to login) rather than crashing.
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
