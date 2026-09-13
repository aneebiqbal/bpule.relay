import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

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

  const generatedToday = await store.countContentDraftsToday(personaId)
  if (generatedToday >= 2) {
    return NextResponse.json({ suggestions: [], capped: true })
  }

  const pillars = await store.listContentPillars(personaId)
  const recentHistory = await store.listContentHistory(personaId, 10)
  const recentPillarIds = new Set(recentHistory.slice(0, 4).map((h) => h.pillarId).filter(Boolean))
  const recentOpenings = recentHistory.map((h) => normalize(h.openingLine)).filter(Boolean)

  const candidates = await store.listTrendingAnglesByPillarIds(
    pillars.map((p) => p.id),
    { unusedOnly: true },
  )

  const byPillar = new Map(pillars.map((p) => [p.id, p]))
  const filtered = candidates
    .filter((a) => !recentPillarIds.has(a.pillarId))
    .filter((a) => !matchesRecentOpening(a.angleDescription, recentOpenings))
    .slice(0, Math.max(0, 2 - generatedToday))
    .map((a) => ({
      id: a.id,
      pillarId: a.pillarId,
      pillarName: byPillar.get(a.pillarId)?.pillarName ?? 'Unknown',
      angleDescription: a.angleDescription,
      sourceNote: a.sourceNote,
    }))

  return NextResponse.json({ suggestions: filtered, capped: false })
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchesRecentOpening(angle: string, recentOpenings: string[]): boolean {
  const normalized = normalize(angle)
  if (!normalized) return false
  return recentOpenings.some((opening) => {
    if (!opening) return false
    if (opening === normalized) return true
    return opening.slice(0, 30) === normalized.slice(0, 30)
  })
}
