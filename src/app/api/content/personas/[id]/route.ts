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

  const { humorStyle, valuesAndOpinions, admiredExamples } = body as {
    humorStyle?: string
    valuesAndOpinions?: string[]
    admiredExamples?: string[]
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

  return NextResponse.json({ persona: updated })
}
