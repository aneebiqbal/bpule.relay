import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('revenue_identities')
    .select('*')
    .eq('organization_id', user.organization.id)
    .order('created_at', { ascending: false })

  if (error) return safeErrorResponse(error, 500, 'Failed to load identities.', 'admin/revenue-identities')
  return NextResponse.json({ identities: data ?? [] })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const identityName = typeof body.identityName === 'string' ? body.identityName.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!identityName || !slug) {
    return NextResponse.json({ error: 'identityName and slug are required.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  const channel = typeof body.channel === 'string' && ['linkedin', 'upwork', 'other'].includes(body.channel)
    ? body.channel
    : 'other'

  const row: Record<string, unknown> = {
    organization_id: user.organization.id,
    slug,
    identity_name: identityName,
    title: typeof body.title === 'string' ? body.title : null,
    positioning: typeof body.positioning === 'string' ? body.positioning : null,
    profile_url: typeof body.profileUrl === 'string' ? body.profileUrl : null,
    skills: Array.isArray(body.skills) ? body.skills : [],
    expertise: Array.isArray(body.expertise) ? body.expertise : [],
    industries: Array.isArray(body.industries) ? body.industries : [],
    technologies: Array.isArray(body.technologies) ? body.technologies : [],
    allowed_first_person_claims: Array.isArray(body.allowedFirstPersonClaims) ? body.allowedFirstPersonClaims : [],
    forbidden_claims: Array.isArray(body.forbiddenClaims) ? body.forbiddenClaims : [],
    channel_rules: body.channelRules && typeof body.channelRules === 'object' ? body.channelRules : {},
    voice_tone: body.voiceTone && typeof body.voiceTone === 'object' ? body.voiceTone : {},
    preferred_opportunity_types: Array.isArray(body.preferredOpportunityTypes) ? body.preferredOpportunityTypes : [],
    proposal_positioning: typeof body.proposalPositioning === 'string' ? body.proposalPositioning : null,
    channel,
    status: 'active',
    source_kind: 'manual',
  }

  const { data, error } = await supabase
    .from('revenue_identities')
    .insert(row)
    .select('*')
    .single()

  if (error) return safeErrorResponse(error, 500, 'Failed to create identity.', 'admin/revenue-identities')

  // Audit log
  await supabase.from('accountability_audit_log').insert({
    organization_id: user.organization.id,
    rep_id: user.rep.id,
    revenue_identity_id: data.id,
    event_type: 'identity_created',
    detail: { identity_name: identityName, slug },
  })

  return NextResponse.json({ identity: data }, { status: 201 })
}
