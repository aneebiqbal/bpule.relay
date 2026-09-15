import { NextRequest, NextResponse } from 'next/server'
import { safeErrorResponse } from '@/lib/errors'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generatePostSeeds } from '@/lib/content/intelligence/v2/idea-engine'
import { generateSurpriseSeed } from '@/lib/content/intelligence/v2/surprise'
import { inferContentUniverse } from '@/lib/content/intelligence/v2/territories'
import { createTasteProfile, applyTasteSignal } from '@/lib/content/intelligence/v2/taste'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/v2/discover
 * Body: { personaId, mode?: 'fresh' | 'surprise' }
 * Returns: { ideas: [...], territories: [...], mode }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { personaId, mode = 'fresh' } = body as {
      personaId: string
      mode?: 'fresh' | 'surprise'
    }

    if (!personaId) {
      return NextResponse.json({ error: 'personaId is required' }, { status: 400 })
    }

    const store = await createScoutStore()
    const persona = await store.getContentPersona(personaId)
    if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null
    const memories = await store.listContentMemories(personaId, { limit: 50 })

    // Load persisted taste profile from DB
    const storedTaste = await store.getTasteProfile(personaId)
    const tasteProfile = storedTaste ? {
      personaId: storedTaste.personaId,
      preferences: storedTaste.preferences,
      territoryAffinity: storedTaste.territoryAffinity,
      totalInteractions: storedTaste.totalInteractions,
      lastUpdated: storedTaste.lastSignalAt ?? new Date().toISOString(),
      shortTerm: storedTaste.shortTerm,
      shortTermWeight: storedTaste.shortTermWeight,
    } : null

    let ideas: Array<Record<string, unknown>> = []
    let surprise: { connectionType: string; explanation: string } | null = null

    if (mode === 'surprise') {
      const surpriseResult = generateSurpriseSeed(profile, memories)
      if (surpriseResult) {
        ideas = [sanitizeSeed(surpriseResult)]
        surprise = {
          connectionType: surpriseResult.connectionType,
          explanation: surpriseResult.connectionExplanation,
        }
      }

      // Persist taste signal for surprise_me
      if (tasteProfile) {
        const updated = applyTasteSignal(tasteProfile, { type: 'surprise_me' })
        await store.saveTasteProfile(personaId, {
          preferences: updated.preferences,
          territoryAffinity: updated.territoryAffinity,
          totalInteractions: updated.totalInteractions,
          lastSignalType: 'surprise_me',
          shortTerm: updated.shortTerm,
          shortTermWeight: updated.shortTermWeight,
        })
      }
    } else {
      // Generate seeds using loaded taste profile
      const result = generatePostSeeds(profile, memories, tasteProfile)
      ideas = result.selected.map(sanitizeSeed)
    }

    const universe = inferContentUniverse(profile, memories)

    return NextResponse.json({
      ideas,
      territories: universe.territories.slice(0, 8).map(t => ({
        territory: t.territory,
        weight: Math.round(t.weight * 100) / 100,
        freshness: Math.round(t.freshness * 100) / 100,
      })),
      mode,
      surprise,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[content/intelligence/v2/discover] failed:', err)
    return safeErrorResponse(err, 500, 'Discovery failed.', 'content/intelligence/v2/discover')
  }
}

function sanitizeSeed(seed: { id?: string; idea?: string; angle?: string; contentType?: string; groundingType?: string; whyInteresting?: string; audience?: string; territory?: string; researchNeeded?: boolean; personalizationNeeded?: boolean; evidenceSource?: string; connectionType?: string; connectionExplanation?: string }): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  if (seed.id) result.id = seed.id
  if (seed.idea) result.idea = seed.idea
  if (seed.angle) result.angle = seed.angle
  if (seed.contentType) result.contentType = seed.contentType
  if (seed.groundingType) result.groundingType = seed.groundingType
  if (seed.whyInteresting) result.whyInteresting = seed.whyInteresting
  if (seed.audience) result.audience = seed.audience
  if (seed.territory) result.territory = seed.territory
  if (seed.researchNeeded !== undefined) result.researchNeeded = seed.researchNeeded
  if (seed.personalizationNeeded !== undefined) result.personalizationNeeded = seed.personalizationNeeded
  if (seed.evidenceSource) result.evidenceSource = seed.evidenceSource
  if (seed.connectionType) result.connectionType = seed.connectionType
  if (seed.connectionExplanation) result.connectionExplanation = seed.connectionExplanation
  return result
}
