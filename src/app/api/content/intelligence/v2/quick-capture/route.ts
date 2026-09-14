import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { parseQuickCapture } from '@/lib/content/quick-capture'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/v2/quick-capture
 * Body: { personaId, input }
 * Returns: { captureId, angles }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const personaId = body?.personaId as string | undefined
  const input = body?.input as string | undefined

  if (!personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 })
  if (!input || input.trim().length < 5) return NextResponse.json({ error: 'input required (min 5 chars)' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const angles = parseQuickCapture(input)

  // Persist the capture
  const capture = await store.createContentQuickCapture?.({
    personaId,
    rawInput: input,
    suggestedAngles: angles,
  })

  return NextResponse.json({
    captureId: capture?.id ?? null,
    angles,
  })
}
