import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getAuthProvider } from '@/lib/auth/provider'
import type { AuthUser } from '@/lib/auth/contract'
import { createServiceSupabase } from '@/lib/supabase/service'
import { provisionInvitedMember } from '@/lib/auth/invitations-server'
import { consumePendingInvitation } from '@/lib/auth/pending-invitations'

type CookieMutation = {
  name: string
  value: string
  options?: Record<string, unknown>
}

function applyCookieMutations(response: NextResponse, mutations: CookieMutation[]): NextResponse {
  for (const mutation of mutations) {
    response.cookies.set(
      mutation.name,
      mutation.value,
      mutation.options as Parameters<typeof response.cookies.set>[2],
    )
  }
  return response
}

function parseRequestCookies(request: Request): Array<{ name: string; value: string }> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return []
  return cookie
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf('=')
      if (index < 0) return { name: item, value: '' }
      return {
        name: item.slice(0, index),
        value: item.slice(index + 1),
      }
    })
}

/**
 * Resolve a post-auth destination. Only same-origin application paths are
 * allowed; a protocol-relative or absolute URL is an open redirect and is
 * replaced by "/". The query string is preserved (deep links like
 * `/leads/123?tab=conversation`).
 */
export function safeNextPath(requested: string | null, origin: string): string {
  if (!requested) return '/'
  try {
    const parsed = new URL(requested, origin)
    if (parsed.origin !== origin) return '/'
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

/**
 * Exchange a Supabase PKCE code for a session.
 *
 * Supabase's authorization-code flow is the one part of sign-in that must run
 * here: the exchange mints the session cookie, which has to be written onto
 * this response. Neon Auth establishes its session through its own API proxy,
 * so it needs no equivalent.
 */
async function exchangeSupabaseCode(
  request: Request,
  code: string | null,
  mutations: CookieMutation[],
): Promise<{ ok: boolean; user?: AuthUser }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    cookies: {
      getAll() {
        return parseRequestCookies(request)
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          mutations.push({
            name: cookie.name,
            value: cookie.value,
            options: cookie.options as Record<string, unknown>,
          })
        }
      },
    },
  })

  if (!code) return { ok: false }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return { ok: false }

  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
    },
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  let redirectTo = safeNextPath(url.searchParams.get('next'), url.origin)

  const auth = await getAuthProvider()
  const cookieMutations: CookieMutation[] = []

  let user: AuthUser | null = null

  if (auth.name === 'supabase') {
    const exchange = await exchangeSupabaseCode(request, code, cookieMutations)
    if (!exchange.ok) {
      return applyCookieMutations(
        NextResponse.redirect(new URL('/login?error=auth_callback_failed', url.origin)),
        cookieMutations,
      )
    }
    user = exchange.user ?? null
  } else {
    // Neon Auth has already established the session through its API proxy.
    const session = await auth.getSession()
    user = session.user
  }

  if (!user) {
    return applyCookieMutations(
      NextResponse.redirect(new URL('/login?error=auth_callback_failed', url.origin)),
      cookieMutations,
    )
  }

  const service = createServiceSupabase()
  const { data: repRows } = await service
    .from('reps')
    .select('id')
    .eq('auth_user_id', user.id)
    .limit(1)

  if (!repRows || repRows.length === 0) {
    // No application identity yet. Only a pending invitation may create one;
    // anyone else is denied, never given a free-floating account with no
    // organisation.
    const invitation = await consumePendingInvitation(service, user.email)
    const provisioned = invitation
      ? await provisionInvitedMember({
          invitation,
          authUserId: user.id,
          email: user.email,
          displayName: user.name,
        })
      : null

    if (!provisioned) {
      await auth.signOut()
      return applyCookieMutations(
        NextResponse.redirect(new URL('/login?error=no_workspace', url.origin)),
        cookieMutations,
      )
    }
    // A brand-new invited member always starts onboarding.
    redirectTo = '/onboarding'
  }

  return applyCookieMutations(
    NextResponse.redirect(new URL(redirectTo, url.origin)),
    cookieMutations,
  )
}
