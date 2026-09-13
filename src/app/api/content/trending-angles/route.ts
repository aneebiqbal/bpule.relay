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

  const pillars = await store.listContentPillars(personaId)
  const byId = new Map(pillars.map((p) => [p.id, p]))
  const angles = await store.listTrendingAnglesByPillarIds(pillars.map((p) => p.id), { unusedOnly: false })

  return NextResponse.json({
    angles: angles.map((angle) => ({
      ...angle,
      pillarName: byId.get(angle.pillarId)?.pillarName ?? 'Unknown',
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { personaId, pillarId, angleDescription, sourceNote } = body as {
    personaId: string
    pillarId: string
    angleDescription: string
    sourceNote?: string
  }

  if (!personaId?.trim()) return NextResponse.json({ error: 'personaId is required' }, { status: 400 })
  if (!pillarId?.trim()) return NextResponse.json({ error: 'pillarId is required' }, { status: 400 })
  if (!angleDescription?.trim()) {
    return NextResponse.json({ error: 'angleDescription is required' }, { status: 400 })
  }

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const pillars = await store.listContentPillars(personaId)
  const pillar = pillars.find((p) => p.id === pillarId)
  if (!pillar) {
    return NextResponse.json({ error: 'Pillar not found for this persona' }, { status: 404 })
  }

  const angle = await store.createTrendingAngle({
    pillarId: pillarId.trim(),
    angleDescription: angleDescription.trim(),
    sourceNote: sourceNote?.trim() ?? '',
    addedBy: user.rep.id,
  })

  return NextResponse.json({ angle })
}
