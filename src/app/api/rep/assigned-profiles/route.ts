import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const org = user.organization
  const rep = user.rep

  // Reps see only identities explicitly assigned to them
  const { data: assignments, error } = await supabase
    .from('identity_assignments')
    .select('id, assigned_by, created_at, revenue_identity_id')
    .eq('rep_id', rep.id)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  if (error) return safeErrorResponse(error, 500, 'Failed to load assigned profiles.', 'rep/assigned-profiles')

  // The identity rows are a second read rather than a PostgREST embed
  // (`identity:revenue_identities`), which the Neon adapter cannot translate.
  const identityIds = (assignments ?? []).map((a) => a.revenue_identity_id).filter(Boolean)
  const identityById = new Map<string, Record<string, unknown>>()
  if (identityIds.length > 0) {
    const { data: identityRows } = await supabase.from('revenue_identities').select('*').in('id', identityIds)
    for (const row of identityRows ?? []) identityById.set(row.id as string, row)
  }
  const assignmentsWithIdentity = (assignments ?? []).map((a) => ({
    ...a,
    identity: identityById.get(a.revenue_identity_id as string) ?? null,
  }))

  const inferChannel = (slug: string | undefined, profileUrl: string | undefined): string => {
    const haystack = `${slug ?? ''} ${profileUrl ?? ''}`.toLowerCase()
    if (haystack.includes('upwork')) return 'upwork'
    if (haystack.includes('linkedin')) return 'linkedin'
    return 'other'
  }

  const profiles = assignmentsWithIdentity
    .filter((a) => {
      const row = Array.isArray(a.identity) ? a.identity[0] : a.identity
      return row && typeof row === 'object'
    })
    .map((a) => {
      const row = (Array.isArray(a.identity) ? a.identity[0] : a.identity) as Record<string, unknown>
      const slug = row.slug as string | undefined
      const profileUrl = row.profile_url as string | undefined
      const rawChannel = row.channel as string | undefined
      const channel = rawChannel && rawChannel !== 'other' ? rawChannel : inferChannel(slug, profileUrl)
      return {
        assignmentId: a.id,
        assignedBy: a.assigned_by,
        assignedAt: a.created_at,
        identity: {
          id: row.id,
          slug,
          identityName: row.identity_name,
          title: row.title,
          positioning: row.positioning,
          profileUrl,
          skills: row.skills,
          expertise: row.expertise,
          industries: row.industries,
          technologies: row.technologies,
          allowedFirstPersonClaims: row.allowed_first_person_claims,
          forbiddenClaims: row.forbidden_claims,
          channelRules: row.channel_rules,
          voiceTone: row.voice_tone,
          preferredOpportunityTypes: row.preferred_opportunity_types,
          proposalPositioning: row.proposal_positioning,
          channel,
          status: row.status ?? 'active',
        },
      }
    })

  return NextResponse.json({ profiles })
}
