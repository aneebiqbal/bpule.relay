import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'
import type { ContentIdeaCard } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/v2/daily
 * Body: { personaId }
 * Returns: { pick, alternatives, timely, territories }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const personaId = body?.personaId as string | undefined
  if (!personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null
  const clusters = await store.listTopicClusters(personaId)
  const history = await store.listContentHistory(personaId, 30)
  const memories = await store.listContentMemories(personaId, { limit: 50 })
  const journey = await store.listContentJourney?.(personaId, 30) ?? []

  const ideas = generateDailyIdeas({
    profile,
    clusters,
    history,
    memories,
    journey,
    contentGoals: profile?.contentGoals ?? [],
    audiences: profile?.audiences ?? [],
    territories: profile?.territories ?? [],
  })

  const pick = ideas[0] ?? null
  const alternatives = ideas.slice(1, 4)
  const timely = ideas.find((i) => i.sourceKind === 'trend') ?? null

  return NextResponse.json({
    pick,
    alternatives,
    timely,
    territories: profile?.territories ?? [],
    personaName: persona.displayName,
    onboardingCompleted: persona.onboardingCompleted,
  })
}
