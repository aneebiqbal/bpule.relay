import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { readInvitation } from '@/lib/auth/invitations'
import { provisionInvitedMember } from '@/lib/auth/invitations-server'

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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  let redirectTo = safeNextPath(url.searchParams.get('next'), url.origin)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', url.origin))
  }

  const cookieMutations: CookieMutation[] = []

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
          cookieMutations.push({
            name: cookie.name,
            value: cookie.value,
            options: cookie.options as Record<string, unknown>,
          })
        }
      },
    },
  })

  if (!code) {
    return applyCookieMutations(
      NextResponse.redirect(new URL('/login?error=missing_code', url.origin)),
      cookieMutations,
    )
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return applyCookieMutations(
      NextResponse.redirect(new URL('/login?error=auth_callback_failed', url.origin)),
      cookieMutations,
    )
  }

  const authUserId = data.user?.id
  if (authUserId) {
    const { data: rep } = await supabase
      .from('reps')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle()

    if (!rep) {
      // No application identity yet. Only a trusted invitation (admin-only
      // app_metadata) may create one; anyone else is denied, never given a
      // free-floating account with no organisation.
      const invitation = readInvitation(data.user?.app_metadata)
      const provisioned = invitation
        ? await provisionInvitedMember({
            invitation,
            authUserId,
            email: data.user?.email ?? '',
            displayName: (data.user?.user_metadata?.full_name as string | undefined) ?? null,
          })
        : null

      if (!provisioned) {
        await supabase.auth.signOut()
        return applyCookieMutations(
          NextResponse.redirect(new URL('/login?error=no_workspace', url.origin)),
          cookieMutations,
        )
      }
      // A brand-new invited member always starts onboarding.
      redirectTo = '/onboarding'
    }
  }

  return applyCookieMutations(
    NextResponse.redirect(new URL(redirectTo, url.origin)),
    cookieMutations,
  )
}
