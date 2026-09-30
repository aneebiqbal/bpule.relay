import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const client = createServiceSupabase()

  const { data: profile, error } = await client
    .from('profiles')
    .select(`
      *,
      rep:reps(id, name),
      assignments:profile_assignments(id, rep_id, reps(id, name)),
      sources:profile_sources(id, original_filename, mime_type, file_size_bytes, parsing_status, extraction_status, uploaded_at),
      reviews:profile_reviews(id, review_text, reviewer_name, reviewer_company, relevant_skills, confidence, safe_for_outreach, ownership_status),
      claims:profile_claims(id, claim_key, claim_value, evidence_type, is_inferred, user_corrected, user_rejected),
      proof_cards:proof_cards(id, capability, strength, safe_claim, source_type, tags, verified, forbidden_claims),
      portfolio_projects:portfolio_projects(id, project_title, my_role, description, skills, technologies)
    `)
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  return NextResponse.json({ profile })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

  const client = createServiceSupabase()

  const editableFields = [
    'full_name', 'display_name', 'headline', 'current_role', 'company',
    'location', 'bio', 'professional_summary', 'seniority', 'years_experience',
    'positioning', 'readiness',
  ]
  const arrayFields = [
    'primary_skills', 'secondary_skills', 'technologies', 'industries',
    'service_capabilities', 'specialties', 'differentiators', 'languages',
  ]

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of editableFields) {
    if (body[field] !== undefined) updates[field] = body[field]
  }
  for (const field of arrayFields) {
    if (body[field] !== undefined) updates[field] = body[field]
  }
  if (body.communication_style !== undefined) updates.communication_style = body.communication_style

  const { data, error } = await client
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .select()
    .single()

  if (error) return safeErrorResponse(error, 500, 'Failed to update profile.', 'profile-intelligence/[id]')

  return NextResponse.json({ profile: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const client = createServiceSupabase()

  const { data, error } = await client
    .from('profiles')
    .update({ archived_at: new Date().toISOString(), readiness: 'incomplete' })
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .select()
    .single()

  if (error) return safeErrorResponse(error, 500, 'Failed to archive profile.', 'profile-intelligence/[id]')

  return NextResponse.json({ profile: data })
}
