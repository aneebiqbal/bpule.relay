import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { discoverOpportunities } from '@/lib/content/intelligence/opportunities'
import { analyzePerformance, adjustOpportunityConfidence } from '@/lib/content/intelligence/performance'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/discover
 * Body: { personaId, recentInput? }
 * Returns: { opportunities: OpportunityCandidate[] }
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

  const baseOpportunities = discoverOpportunities({
    profile,
    clusters,
    history,
    memories,
    recentUserInput: body?.recentInput as string | undefined,
  })

  // Apply performance-based confidence adjustment
  const performanceInsights = analyzePerformance(history)
  const opportunities = baseOpportunities.map((opp) => ({
    ...opp,
    confidence: adjustOpportunityConfidence(opp.confidence, opp.type, performanceInsights),
  }))

  return NextResponse.json({ opportunities })
}
