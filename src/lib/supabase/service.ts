import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS entirely — never expose this to
 * a route that serves a browser request. Scoped to system actions that
 * genuinely have no signed-in rep to bind a session to: the off-peak
 * scheduled jobs (eval harness run, few-shot pool refresh), gated by
 * requireCronSecret() below, never by rep auth.
 */
export function createServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for scheduled jobs.',
    )
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Verifies the request actually came from Vercel Cron (or a manual trigger
 * that knows the secret), never from a browser. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` on every scheduled invocation when
 * CRON_SECRET is set; this is the only auth a cron-triggered route gets,
 * since there is no rep session to check.
 */
export function requireCronSecret(request: Request): { ok: true } | { ok: false; status: number } {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // Refuse to run rather than silently allow an unauthenticated system
    // action just because the operator forgot to set the secret.
    return { ok: false, status: 500 }
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, status: 401 }
  }
  return { ok: true }
}
