/**
 * Supabase Auth — server half of the canonical contract.
 *
 * Imports `next/headers` (through the per-request Supabase client) and the
 * service-role client, so this module must never be pulled into a browser
 * bundle. Browser code uses `supabaseBrowserAuth()` from `./supabase`.
 */
import type { AuthProvider, AuthSession, AuthUser } from './contract'

function toUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null): AuthUser | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? '',
    name: (user.user_metadata?.full_name as string | undefined) ?? null,
  }
}

/** The server methods, as a partial provider. */
export function supabaseServerAuth(): Pick<
  AuthProvider,
  'getSession' | 'exchangeCodeForSession' | 'createUser' | 'deleteUser' | 'signOutUser'
> {
  return {
    async getSession(): Promise<AuthSession> {
      const { getSupabaseAuthClient } = await import('@/lib/supabase/server')
      const supabase = await getSupabaseAuthClient()

      // Prefer the locally-verified claims (no round trip), but treat a failed
      // verification as inconclusive rather than signed out: ask the Auth
      // service so a valid session is never dropped.
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
      const claimedId = claimsData?.claims?.sub ?? null
      if (!claimsError && claimedId) {
        const email = (claimsData?.claims?.email as string | undefined) ?? ''
        return { user: { id: claimedId, email, name: null } }
      }

      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) return { user: null }
      return { user: toUser(data.user) }
    },

    async exchangeCodeForSession(code) {
      const { createServerClient } = await import('@supabase/ssr')
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anonKey) return { error: { message: 'Supabase is not configured.' } }
      const supabase = createServerClient(url, anonKey, {
        cookies: { getAll: () => [], setAll: () => {} },
      })
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data.user) return { error: { message: error?.message ?? 'Sign-in failed.' } }
      return { user: toUser(data.user) ?? undefined }
    },

    async createUser({ email, password, name }) {
      const { createServiceSupabaseAuth } = await import('@/lib/supabase/service')
      const service = createServiceSupabaseAuth()
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name ?? null },
      })
      if (error || !data.user) {
        return { error: { message: error?.message ?? 'Could not create the user.' } }
      }
      return { userId: data.user.id }
    },

    async deleteUser(userId) {
      const { createServiceSupabaseAuth } = await import('@/lib/supabase/service')
      const service = createServiceSupabaseAuth()
      await service.auth.admin.deleteUser(userId)
    },

    async signOutUser(userId) {
      const { createServiceSupabaseAuth } = await import('@/lib/supabase/service')
      const service = createServiceSupabaseAuth()
      await service.auth.admin.signOut(userId)
    },
  }
}
