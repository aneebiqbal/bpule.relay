import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generateContent } from '@/lib/ai/content'
import { sseStream } from '@/lib/sse/sse'
import { injectStyleCard } from '@/lib/style/inject'
import type { ContentGenerationInput } from '@/lib/ai/content'

export const dynamic = 'force-dynamic'

/**
 * Generate a content draft.
 *
 * Body: { personaId, pillarId, sourceMaterial, platform }
 * Returns: SSE stream with { type: 'done', result: ContentGenerationResult }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { personaId, pillarId, sourceMaterial, platform } = body as {
    personaId: string
    pillarId: string | null
    sourceMaterial: string
    platform: 'linkedin' | 'x'
  }

  if (!personaId?.trim()) return NextResponse.json({ error: 'personaId is required' }, { status: 400 })
  if (!sourceMaterial?.trim()) return NextResponse.json({ error: 'sourceMaterial is required — the system never invents a post' }, { status: 400 })
  if (!['linkedin', 'x'].includes(platform)) return NextResponse.json({ error: 'platform must be linkedin or x' }, { status: 400 })

  const store = await createScoutStore()

  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })

  // Verify ownership
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Resolve pillar
  let pillar = null
  if (pillarId) {
    const pillars = await store.listContentPillars(personaId)
    pillar = pillars.find((p) => p.id === pillarId) ?? null
  }
  if (!pillar) {
    // Use first pillar as default
    const pillars = await store.listContentPillars(personaId)
    if (pillars.length === 0) return NextResponse.json({ error: 'No pillars configured for this persona' }, { status: 400 })
    pillar = pillars[0]
  }

  // Get voice profile
  let styleCard: string | null = null
  if (persona.voiceProfileId) {
    const voiceProfile = await store.getVoiceProfile()
    if (voiceProfile) {
      styleCard = injectStyleCard(voiceProfile.styleCard)
    }
  }

  // Get recent opening lines for repetition check
  const history = await store.listContentHistory(personaId, 10)
  const recentOpenings = history.map((h) => h.openingLine).filter(Boolean)

  const input: ContentGenerationInput = {
    personaName: persona.displayName,
    pillar,
    sourceMaterial: sourceMaterial.trim(),
    platform,
    styleCard,
    recentOpenings,
  }

  return sseStream(async (emit) => {
    try {
      const result = await generateContent(input, (msg) => emit({ type: 'status', message: msg }))
      emit({ type: 'done', result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed.'
      emit({ type: 'error', message })
    }
  })
}


