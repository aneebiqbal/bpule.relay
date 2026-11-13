/**
 * Browser-side authentication provider selection.
 *
 * Client components must use this, never `getAuthProvider()` from
 * `./provider`: that module reaches `next/headers` and the Neon Auth server SDK,
 * neither of which can be bundled for the browser.
 *
 * `RELAY_AUTH_PROVIDER` picks the backend, defaulting to `supabase`.
 */
import { resolveAuthProvider, type AuthProvider, type AuthProviderName, type BrowserAuthProvider } from './contract'
import { supabaseBrowserAuth } from './supabase'

let neonBrowser: BrowserAuthProvider | null = null

/** The provider this process is running. */
export function currentBrowserAuthProvider(): AuthProviderName {
  return resolveAuthProvider()
}

/**
 * The canonical authentication provider for client components — sign-in,
 * sign-out and password reset only.
 */
export async function getBrowserAuth(): Promise<BrowserAuthProvider> {
  // `neon` and `aiven` both use the origin-agnostic Better Auth browser client
  // (it calls /api/auth/*, which the app serves). Only `supabase` talks to
  // Supabase directly.
  if (resolveAuthProvider() !== 'supabase') {
    if (!neonBrowser) {
      const { neonBrowserAuth } = await import('./neon')
      neonBrowser = neonBrowserAuth()
    }
    return neonBrowser
  }
  return supabaseBrowserAuth()
}

/**
 * Diagnostics for the provider actually selected in the browser. Read by
 * `/api/version`-style checks and by the runtime certification; it reports the
 * server-rendered bootstrap flag so a drift is visible rather than silent.
 */
export function describeBrowserAuthSelection(): Record<string, string> {
  return { authProvider: resolveAuthProvider() }
}
