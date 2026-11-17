import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const org = user.organization
  const rep = user.rep

  // The canonical execution scope is the single authority for "what can this
  // rep work". Reading `identity_assignments` directly also surfaced eligibility
  // with no coverage seat — assignments the rep could see but not execute.
  const policy = await loadOperatingPolicy(org.id, supabase)
  const businessDate = orgDate(currentInstant(), policy.timezone)
  const executable = await listExecutableIdentitiesForRep(supabase, org.id, rep.id, businessDate)

  const identityIds = executable.map((row) => row.id).filter(Boolean)
  const identityById = new Map<string, Record<string, unknown>>()
  if (identityIds.length > 0) {
    const { data: identityRows } = await supabase.from('revenue_identities').select('*').in('id', identityIds)
    for (const row of identityRows ?? []) identityById.set(row.id as string, row)
  }

  const inferChannel = (slug: string | undefined, profileUrl: string | undefined): string => {
    const haystack = `${slug ?? ''} ${profileUrl ?? ''}`.toLowerCase()
    if (haystack.includes('upwork')) return 'upwork'
    if (haystack.includes('linkedin')) return 'linkedin'
    return 'other'
  }

  const profiles = executable
    .map((row) => {
      const identity = identityById.get(row.id)
      if (!identity) return null
      const slug = identity.slug as string | undefined
      const profileUrl = identity.profile_url as string | undefined
      const rawChannel = identity.channel as string | undefined
      const channel = rawChannel && rawChannel !== 'other' ? rawChannel : inferChannel(slug, profileUrl)
      return {
        assignmentId: row.assignmentId,
        assignedBy: row.assignedBy,
        assignedAt: row.assignedAt,
        // `access` is the rep's precise seat: primary, operator or coverage.
        access: row.access,
        identity: {
          id: identity.id,
          slug,
          identityName: identity.identity_name,
          title: identity.title,
          positioning: identity.positioning,
          profileUrl,
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
          channel,
          status: identity.status ?? 'active',
        },
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  return NextResponse.json({ profiles })
}
