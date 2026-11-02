import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServiceSupabase } from '@/lib/supabase/service'
import { profileAccess } from '@/lib/profile-intelligence/access'

export async function GET(request: Request) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!profileAccess(authCtx).canManage) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const client = createServiceSupabase()
  const orgId = authCtx.orgId

  const { data: profiles } = await client
    .from('profiles')
    .select(`
      id, full_name, display_name, label, headline, current_role, company,
      cv_path, readiness, extraction_version, source_count, proof_count,
      primary_skills, technologies, professional_summary, archived_at
    `)
    .eq('organization_id', orgId)
    .is('archived_at', null)

  if (!profiles) {
    return NextResponse.json({ error: 'Failed to load profiles.' }, { status: 500 })
  }

  // The related ids used to arrive as PostgREST embeds, which the Neon adapter
  // cannot translate. One batched read per relation over the page's ids.
  const ids = profiles.map((p) => p.id)
  const [assignmentRows, proofCardRows, portfolioRows, conversationRows] = await Promise.all([
    ids.length > 0 ? client.from('profile_assignments').select('profile_id').in('profile_id', ids) : Promise.resolve({ data: [] }),
    ids.length > 0 ? client.from('proof_cards').select('profile_id').in('profile_id', ids) : Promise.resolve({ data: [] }),
    ids.length > 0 ? client.from('portfolio_projects').select('profile_id').in('profile_id', ids) : Promise.resolve({ data: [] }),
    ids.length > 0 ? client.from('conversation_states').select('lead_id').in('profile_id', ids) : Promise.resolve({ data: [] }),
  ])
  const presence = (rows: Array<{ profile_id: string }> | null | undefined) => {
    const set = new Set<string>()
    for (const r of rows ?? []) set.add(r.profile_id as string)
    return set
  }
  const hasAssignment = presence(assignmentRows.data)
  const hasProofCard = presence(proofCardRows.data)
  const hasPortfolio = presence(portfolioRows.data)
  const hasConversation = presence(conversationRows.data)

  const enriched = profiles.map((p) => ({
    ...p,
    assignments: hasAssignment.has(p.id) ? [{ id: p.id }] : [],
    proof_cards: hasProofCard.has(p.id) ? [{ id: p.id }] : [],
    portfolio_projects: hasPortfolio.has(p.id) ? [{ id: p.id }] : [],
    conversation_states: hasConversation.has(p.id) ? [{ id: p.id }] : [],
  }))

  const classification = {
    total: profiles.length,
    keep: [] as any[],
    merge: [] as any[],
    archive: [] as any[],
    review: [] as any[],
  }

  for (const profile of enriched) {
    const hasMeaningfulData = isMeaningfulProfile(profile)
    const hasAssignment = (profile.assignments?.length ?? 0) > 0
    const hasProof = (profile.proof_cards?.length ?? 0) > 0
    const hasProjects = (profile.portfolio_projects?.length ?? 0) > 0
    const hasConversations = (profile.conversation_states?.length ?? 0) > 0
    const isV2 = profile.extraction_version === 'v2'

    if (!hasMeaningfulData) {
      classification.archive.push({
        id: profile.id,
        name: profile.full_name ?? profile.display_name ?? profile.label ?? 'unnamed',
        reason: 'No meaningful data — empty or random profile',
        hasAssignment,
      })
    } else if (isV2 && hasMeaningfulData) {
      classification.keep.push({
        id: profile.id,
        name: profile.full_name ?? profile.display_name ?? profile.label,
        reason: 'V2 profile with meaningful data',
        sourceCount: profile.source_count,
        proofCount: profile.proof_count,
      })
    } else if (hasAssignment || hasConversations) {
      classification.review.push({
        id: profile.id,
        name: profile.full_name ?? profile.display_name ?? profile.label ?? 'unnamed',
        reason: 'Legacy profile with active assignment or conversation references',
        hasAssignment,
        hasConversations,
        hasProof,
        hasProjects,
      })
    } else if (hasMeaningfulData && !hasAssignment) {
      classification.merge.push({
        id: profile.id,
        name: profile.full_name ?? profile.display_name ?? profile.label ?? 'unnamed',
        reason: 'Legacy profile with data but no active references — candidate for merge into V2',
        hasProof,
        hasProjects,
      })
    } else {
      classification.archive.push({
        id: profile.id,
        name: profile.full_name ?? profile.display_name ?? profile.label ?? 'unnamed',
        reason: 'Legacy profile with no active references',
        hasAssignment,
      })
    }
  }

  return NextResponse.json({
    report: {
      total: profiles.length,
      keep: classification.keep.length,
      merge: classification.merge.length,
      archive: classification.archive.length,
      review: classification.review.length,
    },
    classification,
  })
}

export async function POST(request: Request) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!profileAccess(authCtx).canManage) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.profile_ids || !Array.isArray(body.profile_ids)) {
    return NextResponse.json({ error: 'profile_ids array required.' }, { status: 400 })
  }

  const client = createServiceSupabase()
  const orgId = authCtx.orgId

  const { data, error } = await client
    .from('profiles')
    .update({ archived_at: new Date().toISOString(), readiness: 'incomplete' })
    .in('id', body.profile_ids)
    .eq('organization_id', orgId)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Archive failed.' }, { status: 500 })
  }

  return NextResponse.json({
    archived: data?.length ?? 0,
    profile_ids: body.profile_ids,
  })
}

function isMeaningfulProfile(profile: any): boolean {
  const hasName = !!(profile.full_name || profile.display_name || profile.label)
  const hasCV = !!profile.cv_path
  const hasSkills = Array.isArray(profile.primary_skills) && profile.primary_skills.length > 0
  const hasTechnologies = Array.isArray(profile.technologies) && profile.technologies.length > 0
  const hasSummary = !!(profile.professional_summary || profile.headline)
  const hasRole = !!profile.current_role

  const dataPoints = [hasName, hasCV, hasSkills, hasTechnologies, hasSummary, hasRole].filter(Boolean).length
  return dataPoints >= 2
}
