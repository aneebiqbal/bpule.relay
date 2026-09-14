import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generateOpinionChoices, getDirectionChoices, type OpinionChoice } from '@/lib/content/intelligence/v2/opinions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/v2/opinions
 * Body: { personaId, territory }
 * Returns: { choices: [...], context, directions }
 *
 * Get one-tap opinion choices for a given territory.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { personaId, territory } = body as {
      personaId: string
      territory: string
    }

    if (!personaId || !territory) {
      return NextResponse.json({ error: 'personaId and territory are required' }, { status: 400 })
    }

    const store = await createScoutStore()
    const persona = await store.getContentPersona(personaId)
    if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null

    const selectionSet = generateOpinionChoices(profile, territory)
    const directions = getDirectionChoices()

    return NextResponse.json({
      choices: selectionSet.choices,
      context: selectionSet.context,
      directions,
    })
  } catch (err) {
    console.error('[content/intelligence/v2/opinions] failed:', err)
    const message = err instanceof Error ? err.message : 'Opinion generation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
