import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { buildDailyDecision } from '@/lib/content/daily-decision'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const personaId = req.nextUrl.searchParams.get('personaId')
  if (!personaId) return NextResponse.json({ error: 'personaId is required' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const clusters = await store.listTopicClusters(personaId)
  const findings = await store.listResearchFindings(personaId, { unusedOnly: true, limit: 10 })
  const feedback = await store.listContentDraftFeedback(personaId, 100)
  const generatedToday = await store.countContentDraftsToday(personaId)

  return NextResponse.json(buildDailyDecision({
    persona,
    clusters,
    findings,
    feedback,
    generatedToday,
  }))
}
