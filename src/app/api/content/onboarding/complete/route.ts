import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import type { ContentPersona, ContentProfile } from '@/lib/domain/types'
import { normalizeOnboardingPayload } from '@/lib/content/onboarding-normalize'

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
  selectedGoals: string[]
  selectedAudiences: string[]
  selectedTerritories: string[]
  voiceSelection: string
  humorStyle: string
  identity?: {
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
  } | null
}

/**
 * POST /api/content/onboarding/complete
 * Creates a full persona with Content Identity from confirmed onboarding data
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body: CompleteOnboardingBody | null = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const normalized = normalizeOnboardingPayload(body)
  if (!normalized.displayName) {
    return NextResponse.json({ error: 'displayName required' }, { status: 400 })
  }
  if (normalized.selectedTerritories.length < 2) {
    return NextResponse.json({ error: 'Select at least 2 territories to complete onboarding' }, { status: 422 })
  }

  const store = await createScoutStore()
  const now = new Date().toISOString()

  // Create the persona
  const persona = await store.createContentPersona({
    repId: user.rep.id,
    displayName: normalized.displayName,
    platforms: normalized.platforms as ContentPersona['platforms'],
    humorStyle: normalized.humorStyle,
    valuesAndOpinions: normalized.identity.opinions.map((o) => o.belief),
  })

  // Create the Content Profile with full identity
  const profile = await store.createContentProfile({
    personaId: persona.id,
    role: normalized.identity.role,
    seniority: normalized.identity.seniority,
    industries: normalized.identity.industries,
    audience: normalized.selectedAudiences[0] ?? normalized.identity.audiences[0] ?? '',
  })

  const territories = normalized.selectedTerritories
  const audiences = normalized.selectedAudiences
  const goals = normalized.selectedGoals

  // Update profile with all extracted data
  await store.updateContentProfile(profile.id, {
    expertise: normalized.identity.expertise,
    opinions: normalized.identity.opinions,
    projects: normalized.identity.projects,
    experiences: normalized.identity.experiences,
    technologies: normalized.identity.technologies.map((name) => ({
      name,
      proficiency: 'proficient' as const,
      context: '',
    })),
    goals: goals.map((description) => ({
      description,
      type: 'authority' as const,
      updatedAt: now,
    })),
    topicsCared: territories.map((topic) => ({
      topic,
      intensity: 'interested' as const,
      source: 'onboarding' as const,
    })),
    audiences,
    territories,
    voiceSelection: normalized.voiceSelection,
  })

  // Create topic clusters from territories
  for (const territory of territories.slice(0, 6)) {
    await store.createTopicCluster({
      personaId: persona.id,
      clusterName: territory,
      description: '',
      sourceType: 'profile',
    })
  }

  // Create journey entries from experiences
  for (const exp of normalized.identity.experiences.slice(0, 4)) {
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
    personaRole: normalized.personaRole || normalized.identity.role,
    personaCompany: normalized.personaCompany,
    personaLocation: normalized.personaLocation,
    contentComfort: normalized.contentComfort,
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
