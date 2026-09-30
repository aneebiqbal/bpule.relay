import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'
import { recordHumanEdits } from '@/lib/profile-intelligence/enrichment-service'
import { effectiveReadiness, LIVE_COUNT_SELECT, liveCounts, profileDisplayName, profileDisplayRole } from '@/lib/profile-intelligence/legacy-display'
import { canViewProfile, profileAccess } from '@/lib/profile-intelligence/access'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const client = createServiceSupabase()

  // Reps: only owned / assigned profiles. 404 (not 403) so ids don't leak.
  if (!(await canViewProfile(client, authCtx, id))) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

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
      portfolio_projects:portfolio_projects(id, project_title, my_role, description, skills, technologies, client_company, start_date, end_date, outcome),
      experience:profile_experience(id, role, company, start_date, end_date, is_current, authority),
      proof_items:proof_items(id, project_summary, review_quote, client_name, client_named),
      ${LIVE_COUNT_SELECT}
    `)
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  return NextResponse.json({ profile: toProfileDetail(profile), access: profileAccess(authCtx) })
}

// The detail UI reads camelCase (matching the list route). Raw snake_case
// rows previously rendered as an empty "Unnamed" profile.
function toProfileDetail(p: any) {
  const counts = liveCounts(p)
  return {
    id: p.id,
    // Pre-V2 profiles: fall back to label / headline for display only.
    fullName: profileDisplayName(p),
    displayName: p.display_name ?? null,
    label: p.label ?? null,
    headline: p.headline ?? null,
    currentRole: profileDisplayRole(p),
    company: p.company ?? null,
    location: p.location ?? null,
    bio: p.bio ?? null,
    professionalSummary: p.professional_summary ?? null,
    seniority: p.seniority ?? null,
    yearsExperience: p.years_experience != null ? Number(p.years_experience) : null,
    primarySkills: p.primary_skills ?? [],
    secondarySkills: p.secondary_skills ?? [],
    technologies: p.technologies ?? [],
    industries: p.industries ?? [],
    specialties: p.specialties ?? [],
    positioning: p.positioning ?? null,
    differentiators: p.differentiators ?? [],
    languages: p.languages ?? [],
    readiness: effectiveReadiness(p, counts),
    profileConfidence: p.profile_confidence ?? null,
    sourceCount: counts.sourceCount,
    proofCount: counts.proofCount,
    aiContext: p.ai_context ?? {},
    archivedAt: p.archived_at ?? null,
    mergedIntoProfileId: p.merged_into_profile_id ?? null,
    rep: p.rep ?? null,
    assignments: (p.assignments ?? []).map((a: any) => ({ id: a.id, rep: a.reps ?? { id: a.rep_id, name: 'Unknown' } })),
    sources: (p.sources ?? []).map((s: any) => ({
      id: s.id, originalFilename: s.original_filename, mimeType: s.mime_type, parsingStatus: s.parsing_status,
      extractionStatus: s.extraction_status, uploadedAt: s.uploaded_at,
    })),
    reviews: (p.reviews ?? []).map((r: any) => ({
      id: r.id, reviewText: r.review_text, reviewerName: r.reviewer_name, reviewerCompany: r.reviewer_company, safeForOutreach: r.safe_for_outreach,
    })),
    claims: (p.claims ?? []).map((c: any) => ({
      id: c.id, claimKey: c.claim_key, claimValue: c.claim_value, evidenceType: c.evidence_type, userCorrected: c.user_corrected,
    })),
    proofCards: [
      ...(p.proof_cards ?? []).map((pc: any) => ({
        id: pc.id, capability: pc.capability, strength: pc.strength, safeClaim: pc.safe_claim, verified: pc.verified,
      })),
      // Legacy proof (pre-V2 proof_items) shown alongside proof cards.
      ...(p.proof_items ?? []).map((pi: any) => ({
        id: pi.id, capability: 'Project', strength: 'moderate',
        safeClaim: [pi.project_summary, pi.client_named && pi.client_name ? `(${pi.client_name})` : null].filter(Boolean).join(' '),
        verified: false,
      })),
    ],
    portfolioProjects: (p.portfolio_projects ?? []).map((pp: any) => ({
      id: pp.id, projectTitle: pp.project_title, myRole: pp.my_role, description: pp.description, technologies: pp.technologies ?? [],
      clientCompany: pp.client_company ?? null, startDate: pp.start_date ?? null, endDate: pp.end_date ?? null, outcome: pp.outcome ?? null,
    })),
    experience: (p.experience ?? [])
      .map((e: any) => ({ id: e.id, role: e.role, company: e.company, startDate: e.start_date, endDate: e.end_date, isCurrent: e.is_current }))
      .sort((a: any, b: any) => Number(b.isCurrent) - Number(a.isCurrent) || String(b.startDate ?? '').localeCompare(String(a.startDate ?? ''))),
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!profileAccess(authCtx).canManage) {
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

  const { data: before } = await client.from('profiles').select('*').eq('id', id).eq('organization_id', authCtx.orgId).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

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

  // Manual edits are HUMAN_VERIFIED: future imports can never override them.
  await recordHumanEdits(client, { orgId: authCtx.orgId, profileId: id, repId: authCtx.repId, before, after: updates })
    .catch((err) => console.warn('[profile-intelligence] failed to record human-verified claims:', err))

  return NextResponse.json({ profile: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!profileAccess(authCtx).canManage) {
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
