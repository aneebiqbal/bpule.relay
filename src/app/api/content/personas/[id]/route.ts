import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { humorStyle, valuesAndOpinions, admiredExamples, contentDna } = body as {
    humorStyle?: string
    valuesAndOpinions?: string[]
    admiredExamples?: string[]
    contentDna?: {
      role?: string
      seniority?: string
      industries?: string[]
      audience?: string
      expertise?: Array<{ area: string; level: 'beginner' | 'intermediate' | 'advanced' | 'expert'; evidence: string }>
      technologies?: Array<{ name: string; proficiency: 'learning' | 'using' | 'proficient' | 'expert'; context: string }>
      goals?: Array<{ description: string; type: 'audience' | 'growth' | 'authority' | 'sales' | 'career' | 'other' }>
      topicsCared?: Array<{ topic: string; intensity: 'casual' | 'interested' | 'passionate' }>
      topicsAvoided?: Array<{ topic: string }>
      opinions?: Array<{ belief: string; strength: 'mild' | 'moderate' | 'strong' }>
      projects?: Array<{ name: string; description: string; role: string; outcome: string; lessons?: string[] }>
      experiences?: Array<{ type: 'project' | 'mistake' | 'success' | 'decision' | 'lesson' | 'career'; description: string; lesson: string }>
      writingCharacteristics?: Record<string, string>
    }
  }

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const updated = await store.updateContentPersonaProfile({
    personaId: id,
    humorStyle: typeof humorStyle === 'string' ? humorStyle.trim() : undefined,
    valuesAndOpinions: Array.isArray(valuesAndOpinions)
      ? valuesAndOpinions.map((v) => String(v).trim()).filter(Boolean)
      : undefined,
    admiredExamples: Array.isArray(admiredExamples)
      ? admiredExamples.map((v) => String(v).trim()).filter(Boolean)
      : undefined,
  })

  if (contentDna && persona.contentProfileId) {
    const now = new Date().toISOString()
    await store.updateContentProfile(persona.contentProfileId, {
      role: contentDna.role,
      seniority: contentDna.seniority,
      industries: contentDna.industries,
      audience: contentDna.audience,
      expertise: contentDna.expertise?.map((e) => ({ ...e, updatedAt: now })),
      technologies: contentDna.technologies,
      goals: contentDna.goals?.map((g) => ({ ...g, updatedAt: now })),
      topicsCared: contentDna.topicsCared?.map((t) => ({ ...t, source: 'onboarding' as const })),
      topicsAvoided: contentDna.topicsAvoided?.map((t) => ({ topic: t.topic, intensity: 'casual' as const, source: 'onboarding' as const })),
      opinions: contentDna.opinions?.map((o) => ({ ...o, evidence: '', source: 'onboarding' as const, updatedAt: now })),
      projects: contentDna.projects?.map((p) => ({ ...p, lessons: p.lessons ?? [], updatedAt: now })),
      experiences: contentDna.experiences?.map((e) => ({ ...e, date: null, updatedAt: now })),
      writingCharacteristics: contentDna.writingCharacteristics,
    })
  }

  const refreshed = await store.getContentPersona(id)
  return NextResponse.json({ persona: refreshed })
}
