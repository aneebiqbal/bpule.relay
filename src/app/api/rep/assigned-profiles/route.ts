import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
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
    .select(`
      id,
      assigned_by,
      created_at,
      identity:revenue_identities(*)
    `)
    .eq('rep_id', rep.id)
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })

  if (error) return safeErrorResponse(error, 500, 'Failed to load assigned profiles.', 'rep/assigned-profiles')

  // Map to clean response — strip org IDs from inner objects for rep view
  const profiles = (assignments ?? []).map((a) => {
    const identity = a.identity as unknown as Record<string, unknown>
    return {
      assignmentId: a.id,
      assignedBy: a.assigned_by,
      assignedAt: a.created_at,
      identity: {
        id: identity.id,
        slug: identity.slug,
        identityName: identity.identity_name,
        title: identity.title,
        positioning: identity.positioning,
        profileUrl: identity.profile_url,
        skills: identity.skills,
        expertise: identity.expertise,
        industries: identity.industries,
        technologies: identity.technologies,
        allowedFirstPersonClaims: identity.allowed_first_person_claims,
        forbiddenClaims: identity.forbidden_claims,
        channelRules: identity.channel_rules,
        voiceTone: identity.voice_tone,
        preferredOpportunityTypes: identity.preferred_opportunity_types,
        proposalPositioning: identity.proposal_positioning,
        status: identity.status,
      },
    }
  })

  return NextResponse.json({ profiles })
}
