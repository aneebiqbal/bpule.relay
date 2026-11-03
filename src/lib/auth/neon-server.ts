/**
 * Neon Auth — server half of the canonical contract.
 *
 * Imports the Neon Auth server SDK, which reads the caller's cookies through
 * Next's request context, so this module must never be pulled into a browser
 * bundle. Browser code uses `neonBrowserAuth()` from `./neon`.
 */
import type { AuthFailure, AuthProvider, AuthSession, AuthUser } from './contract'

function failure(message: string | undefined): AuthFailure {
  return { message: message ?? 'Authentication failed.' }
}

type NeonAuth = ReturnType<typeof import('@neon/auth/next/server').createNeonAuth>

/** The subset of the Neon admin API this app uses. */
export interface NeonAdminAuth {
  createUser: (args: { body: Record<string, unknown> }) => Promise<{
    data?: { user?: { id?: string } | null } | null
    error?: { message?: string } | null
  }>
  removeUser: (args: { body: Record<string, unknown> }) => Promise<unknown>
  revokeUserSessions: (args: { body: Record<string, unknown> }) => Promise<unknown>
}

let instancePromise: Promise<NeonAuth> | null = null

/** The Neon Auth server instance, constructed on first use. */
export function getNeonAuthInstance(): Promise<NeonAuth> {
  // Validated synchronously so a misconfiguration fails loudly at the call
  // site rather than surfacing as a rejected promise deep in a request.
  const baseUrl = process.env.NEON_AUTH_BASE_URL
  const secret = process.env.NEON_AUTH_COOKIE_SECRET
  if (!baseUrl) throw new Error('NEON_AUTH_BASE_URL is not configured for the Neon auth provider')
  if (!secret || secret.length < 32) {
    throw new Error('NEON_AUTH_COOKIE_SECRET must be at least 32 characters for the Neon auth provider')
  }
  if (!instancePromise) {
    instancePromise = import('@neon/auth/next/server').then(({ createNeonAuth }) =>
      createNeonAuth({ baseUrl, cookies: { secret }, logLevel: 'warn' }),
    )
  }
  return instancePromise
}

async function adminApi(): Promise<NeonAdminAuth> {
  const auth = await getNeonAuthInstance()
  return (auth as unknown as { admin: NeonAdminAuth }).admin
}

function toUser(user: { id: string; email?: string | null; name?: string | null } | null | undefined): AuthUser | null {
  if (!user) return null
  return { id: user.id, email: user.email ?? '', name: user.name ?? null }
}

/** The server methods, as a partial provider. */
export function neonServerAuth(): Pick<
  AuthProvider,
  'getSession' | 'createUser' | 'deleteUser' | 'signOutUser'
> {
  return {
    async getSession(): Promise<AuthSession> {
      // The SDK reads the caller's cookies from the current request scope.
      const auth = await getNeonAuthInstance()
      const { data, error } = await auth.getSession()
      if (error || !data?.user) return { user: null }
      return { user: toUser(data.user) }
    },

    async createUser({ email, password, name }) {
      const admin = await adminApi()
      const { data, error } = await admin.createUser({
        body: { email, password, name: name ?? email, role: 'user' },
      })
      if (error || !data?.user?.id) return { error: failure(error?.message) }
      return { userId: data.user.id }
    },

    async deleteUser(userId) {
      const admin = await adminApi()
      await admin.removeUser({ body: { userId } })
    },

    async signOutUser(userId) {
      const admin = await adminApi()
      await admin.revokeUserSessions({ body: { userId } })
    },
  }
}
