/**
 * Server-side authentication provider selection.
 *
 * `RELAY_AUTH_PROVIDER` picks the backend. It defaults to `supabase` so that a
 * deployment that has not opted in behaves exactly as it did before this
 * adapter existed — Supabase Auth is still the rollback path.
 *
 *   RELAY_AUTH_PROVIDER=supabase   (default, rollback)
 *   RELAY_AUTH_PROVIDER=neon
 *
 * This module is server-only: it reaches `next/headers` through the per-request
 * Supabase client and the Neon Auth server SDK. Browser code uses
 * `getBrowserAuth()` from `./browser`.
 *
 * The Neon halves are constructed lazily because `createNeonAuth` validates its
 * cookie secret at construction time and would otherwise throw on a deployment
 * that has no Neon Auth configured.
 */
import { resolveAuthProvider, type AuthProvider, type AuthProviderName } from './contract'
import { supabaseBrowserAuth } from './supabase'
import { supabaseServerAuth } from './supabase-server'

let neonServer: AuthProvider | null = null
let aivenServer: AuthProvider | null = null

/** The provider this process is running. */
export function currentAuthProvider(): AuthProviderName {
  return resolveAuthProvider()
}

/** Whether the Neon Auth provider is active. */
export function isNeonAuthProvider(): boolean {
  return resolveAuthProvider() === 'neon'
}

function supabaseProvider(): AuthProvider {
  return { ...supabaseBrowserAuth(), ...supabaseServerAuth() }
}

/**
 * The canonical authentication provider for server code.
 */
export async function getAuthProvider(): Promise<AuthProvider> {
  const provider = resolveAuthProvider()
  if (provider === 'neon') {
    if (!neonServer) {
      const { neonBrowserAuth } = await import('./neon')
      const { neonServerAuth } = await import('./neon-server')
      neonServer = { ...neonBrowserAuth(), ...neonServerAuth() }
    }
    return neonServer
  }
  if (provider === 'aiven') {
    if (!aivenServer) {
      const { neonBrowserAuth } = await import('./neon')
      const { betterAuthServerAuth } = await import('./better-auth-server')
      // The browser client is origin-agnostic: it calls `/api/auth/*`, which the
      // auth route serves from our own Better Auth handler.
      aivenServer = { ...neonBrowserAuth(), ...betterAuthServerAuth(), name: 'aiven' }
    }
    return aivenServer
  }
  return supabaseProvider()
}

/** Diagnostics only — never includes a secret or a connection string. */
export function describeAuthProvider(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return { authProvider: resolveAuthProvider(env) }
}
