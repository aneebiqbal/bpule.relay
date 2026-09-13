import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generateContent } from '@/lib/ai/content'
import { sseStream } from '@/lib/sse/sse'
import { injectStyleCard } from '@/lib/style/inject'
import type { ContentGenerationInput } from '@/lib/ai/content'
import type { TrendingAngle } from '@/lib/domain/types'

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

  const { personaId, pillarId, sourceMaterial, platform, angleId, personalLine } = body as {
    personaId: string
    pillarId: string | null
    sourceMaterial?: string
    platform: 'linkedin' | 'x'
    angleId?: string | null
    personalLine?: string
  }

  if (!personaId?.trim()) return NextResponse.json({ error: 'personaId is required' }, { status: 400 })
  if (!['linkedin', 'x'].includes(platform)) return NextResponse.json({ error: 'platform must be linkedin or x' }, { status: 400 })

  const store = await createScoutStore()

  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })

  // Verify ownership
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const generatedToday = await store.countContentDraftsToday(personaId)
  if (generatedToday >= 2) {
    return NextResponse.json({ error: 'Daily cap reached: up to 2 generated drafts per persona.' }, { status: 429 })
  }

  let angle: TrendingAngle | null = null

  // Resolve pillar
  let pillar = null
  if (angleId) {
    angle = await store.getTrendingAngle(angleId)
    if (!angle) return NextResponse.json({ error: 'Trending angle not found' }, { status: 404 })
    const anglePillarId = angle.pillarId
    const pillars = await store.listContentPillars(personaId)
    pillar = pillars.find((p) => p.id === anglePillarId) ?? null
    if (!pillar) {
      return NextResponse.json({ error: 'Trending angle does not belong to this persona' }, { status: 400 })
    }
  } else if (pillarId) {
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

  const material = sourceMaterial?.trim() ?? ''
  const realLine = personalLine?.trim() ?? ''
  const generationMode: 'personal' | 'opinion' = angle
    ? (realLine ? 'personal' : 'opinion')
    : 'personal'

  if (!angle && !material) {
    return NextResponse.json({ error: 'sourceMaterial is required - the system never invents a post' }, { status: 400 })
  }

  if (angle && generationMode === 'opinion' && persona.valuesAndOpinions.length === 0) {
    return NextResponse.json({
      error: 'No values/opinions stored for this persona yet. Add convictions first or provide one real line.',
    }, { status: 400 })
  }

  const sourceForGeneration = angle
    ? buildSourceFromAngle({
        angle: angle.angleDescription,
        personalLine: realLine,
        valuesAndOpinions: persona.valuesAndOpinions,
      })
    : material

  const input: ContentGenerationInput = {
    personaName: persona.displayName,
    pillar,
    sourceMaterial: sourceForGeneration,
    platform,
    styleCard,
    recentOpenings,
    humorStyle: persona.humorStyle,
    valuesAndOpinions: persona.valuesAndOpinions,
    generationMode,
    trendingAngle: angle?.angleDescription ?? null,
  }

  return sseStream(async (emit) => {
    try {
      const result = await generateContent(input, (msg) => emit({ type: 'status', message: msg }))
      const draft = await store.createContentDraft({
        personaId,
        pillarId: pillar.id,
        sourceMaterial: sourceForGeneration,
        platform,
        caption: result.caption,
        hookScore: result.hookScore,
        hookFeedback: result.hookFeedback,
        selfCheckPassed: result.selfCheckPassed,
        selfCheckNote: result.selfCheckNote,
        status: result.selfCheckPassed ? 'ready' : 'draft',
      })

      if (angle && result.selfCheckPassed) {
        await store.markTrendingAngleUsed(angle.id)
      }

      emit({ type: 'done', result: { ...result, draftId: draft.id } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed.'
      emit({ type: 'error', message })
    }
  })
}

function buildSourceFromAngle(input: {
  angle: string
  personalLine: string
  valuesAndOpinions: string[]
}): string {
  if (input.personalLine) {
    return `Trending angle: ${input.angle}\n\nReal line from today:\n${input.personalLine}`
  }

  const convictions = input.valuesAndOpinions.length > 0
    ? input.valuesAndOpinions.map((v, i) => `${i + 1}. ${v}`).join('\n')
    : 'None supplied.'

  return `Trending angle: ${input.angle}\n\nOpinion mode: no personal anecdote supplied today. Build from real convictions only:\n${convictions}`
}
