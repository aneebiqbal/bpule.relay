/**
 * Neon Auth — browser half of the canonical contract.
 *
 * Safe for a client bundle: it only imports the Neon Auth browser client. The
 * server half lives in `neon-server.ts`.
 */
import type { AuthFailure, AuthProvider } from './contract'

function failure(message: string | undefined): AuthFailure {
  return { message: message ?? 'Authentication failed.' }
}

/** The subset of the Neon browser client this app uses. */
export interface NeonBrowserAuth {
  signIn: {
    email: (args: { email: string; password: string }) => Promise<{ error?: { message?: string } | null }>
    magicLink: (args: { email: string; callbackURL: string }) => Promise<{ error?: { message?: string } | null }>
    social: (args: { provider: string; callbackURL: string }) => Promise<{
      data?: { url?: string } | null
      error?: { message?: string } | null
    }>
  }
  signOut: () => Promise<{ error?: { message?: string } | null }>
  forgetPassword: (args: { email: string; redirectTo: string }) => Promise<{ error?: { message?: string } | null }>
  resetPassword: (args: { newPassword: string }) => Promise<{ error?: { message?: string } | null }>
  resend: (args: { email: string; type: string }) => Promise<{ error?: { message?: string } | null }>
}

let browserPromise: Promise<NeonBrowserAuth> | null = null

/** The browser auth client, built once per page. */
export function neonBrowserClient(): Promise<NeonBrowserAuth> {
  if (!browserPromise) {
    browserPromise = import('@neon/auth/next').then(({ createAuthClient }) =>
      createAuthClient() as unknown as NeonBrowserAuth,
    )
  }
  return browserPromise
}

/** The browser methods, as a partial provider. */
export function neonBrowserAuth(): Pick<
  AuthProvider,
  | 'name'
  | 'signInWithPassword'
  | 'signInWithOtp'
  | 'signInWithOAuth'
  | 'signOut'
  | 'resetPasswordForEmail'
  | 'updatePassword'
  | 'resendVerification'
> {
  return {
    name: 'neon',

    async signInWithPassword(email, password) {
      const client = await neonBrowserClient()
      const { error } = await client.signIn.email({ email, password })
      return error ? failure(error.message) : null
    },

    async signInWithOtp(email) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const client = await neonBrowserClient()
      const { error } = await client.signIn.magicLink({
        email,
        callbackURL: `${origin}/auth/callback`,
      })
      return error ? failure(error.message) : null
    },

    async signInWithOAuth(provider, redirectTo) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const client = await neonBrowserClient()
      const { data, error } = await client.signIn.social({
        provider,
        callbackURL: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      })
      if (error) return { error: failure(error.message) }
      return { url: data?.url }
    },

    async signOut() {
      const client = await neonBrowserClient()
      await client.signOut()
    },

    async resetPasswordForEmail(email, redirectTo) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const client = await neonBrowserClient()
      const { error } = await client.forgetPassword({
        email,
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      })
      return error ? failure(error.message) : null
    },

    async updatePassword(password) {
      const client = await neonBrowserClient()
      const { error } = await client.resetPassword({ newPassword: password })
      return error ? failure(error.message) : null
    },

    async resendVerification(email) {
      const client = await neonBrowserClient()
      const { error } = await client.resend({ email, type: 'email-verification' })
      return error ? failure(error.message) : null
    },
  }
}
