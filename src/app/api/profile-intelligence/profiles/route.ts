import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'

export async function GET(request: Request) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const url = new URL(request.url)
  const readiness = url.searchParams.get('readiness')
  const includeArchived = url.searchParams.get('archived') === '1'
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const client = createServiceSupabase()

  let query = client
    .from('profiles')
    .select(`
      id, organization_id, rep_id, full_name, display_name, headline,
      current_role, company, location, seniority, years_experience,
      primary_skills, technologies, industries, specialties, positioning,
      profile_confidence, readiness, source_count, proof_count,
      archived_at, created_at, updated_at,
      rep:reps(id, name),
      assignments:profile_assignments(id, rep_id, reps(id, name))
    `)
    .eq('organization_id', authCtx.orgId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (!includeArchived) {
    query = query.is('archived_at', null)
  }

  if (readiness) {
    query = query.eq('readiness', readiness)
  }

  const { data, error } = await query

  if (error) return safeErrorResponse(error, 500, 'Failed to load profiles.', 'profile-intelligence/profiles')

  const profiles = (data ?? []).map((row: any) => ({
    id: row.id,
    organizationId: row.organization_id,
    repId: row.rep_id,
    fullName: row.full_name,
    displayName: row.display_name,
    headline: row.headline,
    currentRole: row.current_role,
    company: row.company,
    location: row.location,
    seniority: row.seniority,
    yearsExperience: row.years_experience,
    primarySkills: row.primary_skills ?? [],
    technologies: row.technologies ?? [],
    industries: row.industries ?? [],
    specialties: row.specialties ?? [],
    positioning: row.positioning,
    profileConfidence: row.profile_confidence,
    readiness: row.readiness,
    sourceCount: row.source_count,
    proofCount: row.proof_count,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rep: row.rep,
    assignments: row.assignments ?? [],
  }))

  return NextResponse.json({ profiles, count: profiles.length })
}
