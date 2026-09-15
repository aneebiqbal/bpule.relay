import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BPULSE_ORG_ID = '11111111-1111-1111-1111-111111111111'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_ATTEMPTS = 5

function rateLimitKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/**
 * Distributed rate limiter backed by Supabase (no in-memory state).
 * Works across Vercel serverless instances. Uses a dedicated table
 * `rate_limits` with automatic cleanup of expired entries.
 */
async function isRateLimited(
  supabase: ReturnType<typeof createClient>,
  key: string,
): Promise<boolean> {
  const now = Date.now()
  const windowStart = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString()

  // Clean up expired entries (best-effort, don't block on failure)
  try {
    await supabase.from('rate_limits').delete().lt('created_at', windowStart)
  } catch {
    // Ignore cleanup errors
  }

  // Count attempts in current window
  const { count, error } = await supabase
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart)

  if (error) {
    // Fail open on DB error — don't block signups if rate limit table is unreachable
    return false
  }

  if ((count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true
  }

  // Record this attempt (fire-and-forget, unique constraint prevents duplicates)
  try {
    await (supabase as unknown as { from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<unknown> } })
      .from('rate_limits')
      .insert({ key, action: 'signup' })
  } catch {
    // Ignore duplicate key errors (unique constraint) and DB errors
  }
  return false
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Service is temporarily unavailable.' },
      { status: 503 },
    )
  }

  let body: { orgName?: string; email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const orgName = typeof body.orgName === 'string' ? body.orgName.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!orgName || !email || !email.includes('@') || password.length < 8) {
    return NextResponse.json(
      { error: 'Please provide a valid organization name, email, and password (8+ characters).' },
      { status: 400 },
    )
  }

  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Distributed rate limit check (works across serverless instances)
  if (await isRateLimited(service as unknown as ReturnType<typeof createClient>, rateLimitKey(request.headers))) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 },
    )
  }

  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({ name: orgName, plan: 'trial' })
    .select('id')
    .single()

  if (orgErr || !org) {
    return NextResponse.json(
      { error: 'Could not create organization. Please try again.' },
      { status: 500 },
    )
  }

  try {
    const { data: bpulseRulebook } = await service
      .from('organization_rulebooks')
      .select('signals, verdict_thresholds, max_signal_weight, max_completeness, confidence_send_threshold')
      .eq('organization_id', BPULSE_ORG_ID)
      .maybeSingle()

    if (bpulseRulebook) {
      await service.from('organization_rulebooks').insert({
        organization_id: org.id,
        signals: bpulseRulebook.signals,
        verdict_thresholds: bpulseRulebook.verdict_thresholds,
        max_signal_weight: bpulseRulebook.max_signal_weight,
        max_completeness: bpulseRulebook.max_completeness,
        confidence_send_threshold: bpulseRulebook.confidence_send_threshold,
      })
    }

    const { data: authUser, error: authErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
    })

    if (authErr || !authUser.user) {
      await service.from('organization_rulebooks').delete().eq('organization_id', org.id)
      await service.from('organizations').delete().eq('id', org.id)
      return NextResponse.json(
        { error: 'Could not create account. The email may already be in use or is not allowed.' },
        { status: 400 },
      )
    }

    try {
      const { error: repErr } = await service.from('reps').insert({
        name: email.split('@')[0],
        role: 'admin',
        organization_id: org.id,
        auth_user_id: authUser.user.id,
      })

      if (repErr) {
        throw repErr
      }
    } catch {
      await service.auth.admin.deleteUser(authUser.user.id)
      await service.from('organization_rulebooks').delete().eq('organization_id', org.id)
      await service.from('organizations').delete().eq('id', org.id)
      return NextResponse.json(
        { error: 'Could not create account. Please try again.' },
        { status: 500 },
      )
    }
  } catch {
    await service.from('organization_rulebooks').delete().eq('organization_id', org.id)
    await service.from('organizations').delete().eq('id', org.id)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      organizationId: org.id,
      requiresEmailConfirmation: true,
      message: 'Account created. Check your email to confirm your address before signing in.',
    },
    { status: 201 },
  )
}
