import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import type { ContentPersona, ContentProfile } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

interface CompleteOnboardingBody {
  displayName: string
  platforms: string[]
  personaRole: string
  personaCompany: string
  personaLocation: string
  contentComfort: string[]
  sourceText: string
  sourceType: string
  identity: {
    role: string
    seniority: string
    industries: string[]
    expertise: ContentProfile['expertise']
    opinions: ContentProfile['opinions']
    projects: ContentProfile['projects']
    experiences: ContentProfile['experiences']
    technologies: string[]
    audiences: string[]
    territories: string[]
    contentGoals: string[]
  }
  voiceSelection: string
  humorStyle: string
}

/**
 * POST /api/content/onboarding/complete
 * Creates a full persona with Content Identity from confirmed onboarding data
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body: CompleteOnboardingBody = await req.json().catch(() => null)
  if (!body?.displayName) {
    return NextResponse.json({ error: 'displayName required' }, { status: 400 })
  }

  const store = await createScoutStore()
  const now = new Date().toISOString()

  // Create the persona
  const persona = await store.createContentPersona({
    repId: user.rep.id,
    displayName: body.displayName,
    platforms: (body.platforms ?? ['linkedin']) as ContentPersona['platforms'],
    humorStyle: body.humorStyle ?? (body.identity.role.includes('Founder') ? 'conversational' : 'professional'),
    valuesAndOpinions: body.identity.opinions.map((o) => o.belief),
  })

  // Create the Content Profile with full identity
  const profile = await store.createContentProfile({
    personaId: persona.id,
    role: body.identity.role,
    seniority: body.identity.seniority,
    industries: body.identity.industries,
    audience: body.identity.audiences[0] ?? '',
  })

  // Update profile with all extracted data
  await store.updateContentProfile(profile.id, {
    expertise: body.identity.expertise,
    opinions: body.identity.opinions,
    projects: body.identity.projects,
    experiences: body.identity.experiences,
    technologies: body.identity.technologies.map((name) => ({
      name,
      proficiency: 'proficient' as const,
      context: '',
    })),
    goals: body.identity.contentGoals.map((description) => ({
      description,
      type: 'authority' as const,
      updatedAt: now,
    })),
    topicsCared: body.identity.territories.map((topic) => ({
      topic,
      intensity: 'interested' as const,
      source: 'onboarding' as const,
    })),
  })

  // Create topic clusters from territories
  for (const territory of body.identity.territories.slice(0, 6)) {
    await store.createTopicCluster({
      personaId: persona.id,
      clusterName: territory,
      description: '',
      sourceType: 'profile',
    })
  }

  // Create journey entries from experiences
  for (const exp of body.identity.experiences.slice(0, 4)) {
    await store.createContentJourneyEntry({
      personaId: persona.id,
      eventType: exp.type === 'success' ? 'milestone' : exp.type === 'mistake' ? 'learned' : 'project',
      title: exp.description.slice(0, 80),
      description: exp.lesson || exp.description,
      eventDate: null,
      source: 'imported',
    })
  }

  // Update persona with onboarding data
  await store.updateContentPersona({
    personaId: persona.id,
    personaRole: body.personaRole || body.identity.role,
    personaCompany: body.personaCompany,
    personaLocation: body.personaLocation,
    contentComfort: body.contentComfort,
    onboardingStep: 'complete',
    onboardingCompleted: true,
  })

  // Get updated persona
  const updatedPersona = await store.getContentPersona(persona.id)

  return NextResponse.json({
    persona: updatedPersona,
    profile: await store.getContentProfile(profile.id),
    redirectTo: `/content/${persona.id}/today`,
  })
}
