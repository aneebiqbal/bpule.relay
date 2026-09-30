import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'
import { profileAccess, visibleProfileIds } from '@/lib/profile-intelligence/access'
import { effectiveReadiness, LIVE_COUNT_SELECT, liveCounts, profileDisplayName, profileDisplayRole } from '@/lib/profile-intelligence/legacy-display'

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
      archived_at, created_at, updated_at, label, platform, cv_path,
      rep:reps(id, name),
      ${LIVE_COUNT_SELECT},
      assignments:profile_assignments(id, rep_id, reps(id, name))
    `)
    .eq('organization_id', authCtx.orgId)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (!includeArchived) {
    query = query.is('archived_at', null)
  }

  // Reps see only the profiles they own or are assigned to.
  const access = profileAccess(authCtx)
  const allowed = await visibleProfileIds(client, authCtx)
  if (allowed !== null) {
    if (allowed.length === 0) return NextResponse.json({ profiles: [], count: 0, access })
    query = query.in('id', allowed)
  }

  // readiness is filtered after computing the effective value (legacy
  // profiles store needs_source by default even when they have a CV/proof).

  const { data, error } = await query

  if (error) return safeErrorResponse(error, 500, 'Failed to load profiles.', 'profile-intelligence/profiles')

  const profiles = (data ?? []).map((row: any) => {
    const counts = liveCounts(row)
    return {
    id: row.id,
    organizationId: row.organization_id,
    repId: row.rep_id,
    fullName: profileDisplayName(row),
    displayName: row.display_name,
    headline: row.headline,
    currentRole: profileDisplayRole(row),
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
    readiness: effectiveReadiness(row, counts),
    sourceCount: counts.sourceCount,
    proofCount: counts.proofCount,
    platform: row.platform,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rep: row.rep,
    assignments: row.assignments ?? [],
    }
  }).filter((p) => !readiness || p.readiness === readiness)

  return NextResponse.json({ profiles, count: profiles.length, access })
}
