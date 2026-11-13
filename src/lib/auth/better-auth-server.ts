/**
 * Better Auth (Aiven) — server half of the canonical contract.
 *
 * Mirrors `neon-server.ts` but runs the Better Auth engine locally against the
 * `neon_auth` schema on Aiven instead of forwarding to Neon's hosted service.
 * Server-only: it reaches `next/headers` for the caller's cookies.
 */
import { headers } from 'next/headers'
import type { AuthFailure, AuthProvider, AuthSession, AuthUser } from './contract'
import { getBetterAuthInstance } from './better-auth'

function failure(message: string | undefined): AuthFailure {
  return { message: message ?? 'Authentication failed.' }
}

function toUser(user: { id: string; email?: string | null; name?: string | null } | null | undefined): AuthUser | null {
  if (!user) return null
  return { id: user.id, email: user.email ?? '', name: user.name ?? null }
}

export function betterAuthServerAuth(): Pick<
  AuthProvider,
  'getSession' | 'createUser' | 'deleteUser' | 'signOutUser'
> {
  return {
    async getSession(): Promise<AuthSession> {
      const auth = getBetterAuthInstance()
      const requestHeaders = await headers()
      const session = await auth.api.getSession({ headers: requestHeaders })
      if (!session?.user) return { user: null }
      return { user: toUser(session.user) }
    },

    async createUser({ email, password, name }) {
      const auth = getBetterAuthInstance()
      const res = await auth.api.createUser({
        body: { email, password, name: name ?? email, role: 'user' },
      })
      const user = (res as { user?: { id?: string } | null } | null)?.user
      if (!user?.id) return { error: failure('Failed to create user.') }
      return { userId: user.id }
    },

    async deleteUser(userId) {
      const auth = getBetterAuthInstance()
      await auth.api.removeUser({ body: { userId } })
    },

    async signOutUser(userId) {
      const auth = getBetterAuthInstance()
      await auth.api.revokeUserSessions({ body: { userId } })
    },
  }
}
