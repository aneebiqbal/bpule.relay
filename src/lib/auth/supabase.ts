/**
 * Supabase Auth — browser half of the canonical contract.
 *
 * This module is safe to pull into a client bundle: it only touches the
 * browser Supabase client. The server half lives in `supabase-server.ts`, which
 * imports `next/headers` and must never be bundled for the browser.
 */
import { getBrowserSupabase } from '@/lib/supabase/client'
import type { AuthFailure, AuthProvider } from './contract'

function failure(message: string): AuthFailure {
  return { message }
}

/** The browser methods, as a partial provider. */
export function supabaseBrowserAuth(): Pick<
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
    name: 'supabase',

    async signInWithPassword(email, password) {
      const supabase = getBrowserSupabase()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? failure(error.message) : null
    },

    async signInWithOtp(email) {
      const supabase = getBrowserSupabase()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      })
      return error ? failure(error.message) : null
    },

    async signInWithOAuth(provider, redirectTo) {
      const supabase = getBrowserSupabase()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}` },
      })
      if (error) return { error: failure(error.message) }
      return { url: data.url ?? undefined }
    },

    async signOut() {
      const supabase = getBrowserSupabase()
      await supabase.auth.signOut()
    },

    async resetPasswordForEmail(email, redirectTo) {
      const supabase = getBrowserSupabase()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      })
      return error ? failure(error.message) : null
    },

    async updatePassword(password) {
      const supabase = getBrowserSupabase()
      const { error } = await supabase.auth.updateUser({ password })
      return error ? failure(error.message) : null
    },

    async resendVerification(email) {
      const supabase = getBrowserSupabase()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      })
      return error ? failure(error.message) : null
    },
  }
}
