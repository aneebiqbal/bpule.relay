import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { createTasteProfile, applyTasteSignal, type TasteSignal } from '@/lib/content/intelligence/v2/taste'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/v2/taste
 * Body: { personaId, signal: TasteSignal }
 * Returns: { updated: true, profile: {...} }
 *
 * Record a taste signal and persist the updated profile.
 * Called after user interactions: write_this, not_for_me, posting, etc.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { personaId, signal } = body as {
      personaId: string
      signal: TasteSignal
    }

    if (!personaId || !signal || !signal.type) {
      return NextResponse.json({ error: 'personaId and signal.type are required' }, { status: 400 })
    }

    const store = await createScoutStore()

    // Load existing or create fresh
    const stored = await store.getTasteProfile(personaId)
    const tasteProfile = stored ? {
      personaId: stored.personaId,
      preferences: stored.preferences,
      territoryAffinity: stored.territoryAffinity,
      totalInteractions: stored.totalInteractions,
      lastUpdated: stored.lastSignalAt ?? new Date().toISOString(),
      shortTerm: stored.shortTerm,
      shortTermWeight: stored.shortTermWeight,
    } : createTasteProfile(personaId)

    // Apply the signal
    const updated = applyTasteSignal(tasteProfile, signal)

    // Persist
    await store.saveTasteProfile(personaId, {
      preferences: updated.preferences,
      territoryAffinity: updated.territoryAffinity,
      totalInteractions: updated.totalInteractions,
      lastSignalType: signal.type,
      shortTerm: updated.shortTerm,
      shortTermWeight: updated.shortTermWeight,
    })

    return NextResponse.json({
      updated: true,
      profile: {
        totalInteractions: updated.totalInteractions,
        preferences: updated.preferences,
      },
    })
  } catch (err) {
    console.error('[content/intelligence/v2/taste] failed:', err)
    const message = err instanceof Error ? err.message : 'Signal recording failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
