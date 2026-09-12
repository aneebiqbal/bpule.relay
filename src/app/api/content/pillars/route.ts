import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { personaId, pillarName, description } = body as {
    personaId: string
    pillarName: string
    description?: string
  }

  if (!personaId?.trim()) return NextResponse.json({ error: 'personaId is required' }, { status: 400 })
  if (!pillarName?.trim()) return NextResponse.json({ error: 'pillarName is required' }, { status: 400 })

  const store = await createScoutStore()

  // Verify persona ownership
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const pillar = await store.createContentPillar({
    personaId,
    pillarName: pillarName.trim(),
    description: description?.trim() ?? '',
  })

  return NextResponse.json({ pillar })
}
