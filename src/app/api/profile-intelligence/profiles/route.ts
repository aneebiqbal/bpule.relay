import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'
import { profileAccess, visibleProfileIds } from '@/lib/profile-intelligence/access'
import { effectiveReadiness, liveCounts, profileDisplayName, profileDisplayRole } from '@/lib/profile-intelligence/legacy-display'

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
      archived_at, created_at, updated_at, label, platform, cv_path
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

  // The owner rep, the assignments and the live counts used to arrive as
  // PostgREST embeds, which the Neon adapter cannot translate. They are batched
  // reads over the page's ids, so the page still costs a bounded number of round
  // trips.
  const pageIds = (data ?? []).map((row: any) => row.id as string)
  const ownerIds = (data ?? []).map((row: any) => row.rep_id as string).filter(Boolean)

  const [ownerRows, assignmentRows, proofCardCounts, proofItemCounts, sourceCounts] = await Promise.all([
    ownerIds.length > 0
      ? client.from('reps').select('id, name').in('id', ownerIds)
      : Promise.resolve({ data: [] }),
    pageIds.length > 0
      ? client.from('profile_assignments').select('id, profile_id, rep_id').in('profile_id', pageIds)
      : Promise.resolve({ data: [] }),
    pageIds.length > 0
      ? client.from('proof_cards').select('profile_id', { head: true, count: 'exact' }).in('profile_id', pageIds)
      : Promise.resolve({ data: [] }),
    pageIds.length > 0
      ? client.from('proof_items').select('profile_id', { head: true, count: 'exact' }).in('profile_id', pageIds)
      : Promise.resolve({ data: [] }),
    pageIds.length > 0
      ? client.from('profile_sources').select('profile_id', { head: true, count: 'exact' }).in('profile_id', pageIds)
      : Promise.resolve({ data: [] }),
  ])

  const ownerNameById = new Map((ownerRows.data ?? []).map((r: any) => [r.id as string, r.name as string]))
  const assignmentsByProfile = new Map<string, Array<{ id: string; rep: { id: string; name: string } }>>()
  const assignedRepIds = (assignmentRows.data ?? []).map((a: any) => a.rep_id as string).filter(Boolean)
  const assignedRepNameById = new Map<string, string>()
  if (assignedRepIds.length > 0) {
    const { data: reps } = await client.from('reps').select('id, name').in('id', assignedRepIds)
    for (const r of reps ?? []) assignedRepNameById.set(r.id as string, r.name as string)
  }
  for (const a of assignmentRows.data ?? []) {
    const list = assignmentsByProfile.get(a.profile_id as string) ?? []
    list.push({ id: a.id, rep: { id: a.rep_id, name: assignedRepNameById.get(a.rep_id as string) ?? 'Unknown' } })
    assignmentsByProfile.set(a.profile_id as string, list)
  }

  const countByProfile = (rows: Array<{ profile_id: string }> | null | undefined) => {
    const map = new Map<string, number>()
    for (const r of rows ?? []) map.set(r.profile_id as string, (map.get(r.profile_id as string) ?? 0) + 1)
    return map
  }
  const proofCardByProfile = countByProfile(proofCardCounts.data)
  const proofItemByProfile = countByProfile(proofItemCounts.data)
  const sourceByProfile = countByProfile(sourceCounts.data)

  const profiles = (data ?? []).map((row: any) => {
    const proofCardsCount = proofCardByProfile.get(row.id) ?? 0
    const proofItemsCount = proofItemByProfile.get(row.id) ?? 0
    const sourcesCount = sourceByProfile.get(row.id) ?? 0
    const counts = liveCounts({
      ...row,
      proof_cards_count: proofCardsCount,
      proof_items_count: proofItemsCount,
      sources_count: sourcesCount,
    })
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
    rep: row.rep_id ? { id: row.rep_id, name: ownerNameById.get(row.rep_id) ?? 'Unknown' } : null,
    assignments: assignmentsByProfile.get(row.id) ?? [],
    }
  }).filter((p) => !readiness || p.readiness === readiness)

  return NextResponse.json({ profiles, count: profiles.length, access })
}
