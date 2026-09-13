import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
const BPULSE_ORG_ID = '11111111-1111-1111-1111-111111111111'

/**
 * Self-service signup. Creates a new organization, its first admin user, and
 * seeds the bpulse rulebook as a copyable template — no manual DB seeding.
 *
 * Body: { orgName, email, password }
 *
 * The service role key is required because we need to create an auth user and
 * then link it to a new rep row, which the anon key cannot do (RLS blocks
 * inserting into reps for non-admins, and there are no admins yet in a new org).
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Service role not configured.' },
      { status: 500 },
    )
  }

  let body: { orgName?: string; email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const orgName = typeof body.orgName === 'string' ? body.orgName.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!orgName) {
    return NextResponse.json({ error: 'Organization name is required.' }, { status: 400 })
  }
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 },
    )
  }

  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Create the organization.
  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({ name: orgName, plan: 'trial' })
    .select('id, name, plan, billing_customer_id, created_at')
    .single()

  if (orgErr || !org) {
    return NextResponse.json(
      { error: orgErr?.message ?? 'Failed to create organization.' },
      { status: 500 },
    )
  }

  // 2. Copy bpulse's rulebook as the new org's template.
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

  // 3. Create the auth user via the admin API.
  const { data: authUser, error: authErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authErr || !authUser.user) {
    // Roll back the org if user creation fails.
    await service.from('organizations').delete().eq('id', org.id)
    return NextResponse.json(
      { error: authErr?.message ?? 'Failed to create user.' },
      { status: 400 },
    )
  }

  // 4. Create the rep row as admin of the new org.
  const { error: repErr } = await service.from('reps').insert({
    name: email.split('@')[0],
    role: 'admin',
    organization_id: org.id,
    auth_user_id: authUser.user.id,
  })

  if (repErr) {
    // Roll back auth user and org.
    await service.auth.admin.deleteUser(authUser.user.id)
    await service.from('organizations').delete().eq('id', org.id)
    return NextResponse.json(
      { error: repErr.message ?? 'Failed to create rep.' },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      organizationId: org.id,
      userId: authUser.user.id,
      message: 'Account created. Sign in with your email and password.',
    },
    { status: 201 },
  )
}
