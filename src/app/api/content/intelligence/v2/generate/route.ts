import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { safeErrorResponse } from '@/lib/errors'
import { runContentForge } from '@/lib/content/intelligence/forge'
import { buildContentDnaPromptBlock } from '@/lib/content/content-dna'
import { buildMemoryPromptBlock, extractMemoriesFromDraft, checkMemoryForDuplicates } from '@/lib/content/intelligence/memory'
import { constructIdeaGenome, buildGenomePromptBlock } from '@/lib/content/intelligence/genome'
import { analyzePerformance, buildPerformancePromptBlock } from '@/lib/content/intelligence/performance'
import { requiresResearch, buildResearchPromptBlock, generateConstraints, noopResearchProvider, performResearch } from '@/lib/content/intelligence/research'
import { injectStyleCard } from '@/lib/style/inject'
import type { ContentType, GroundingType } from '@/lib/content/intelligence/v2/idea-engine'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/v2/generate
 * Body: { personaId, seedId, idea, angle, contentType, groundingType, platform, confirmedOpinion?, direction? }
 * Returns: { draft: { caption, evaluation, ... } }
 *
 * Generate a draft from a selected seed. No interview required.
 * Routes to appropriate grounding type automatically.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { personaId, idea, angle, contentType, groundingType, platform, confirmedOpinion, direction } = body as {
      personaId: string
      seedId?: string
      idea: string
      angle: string
      contentType: ContentType
      groundingType: GroundingType
      platform: 'linkedin' | 'x'
      confirmedOpinion?: string
      direction?: string
    }

    if (!personaId || !idea || !platform) {
      return NextResponse.json({ error: 'personaId, idea, and platform are required' }, { status: 400 })
    }

    const store = await createScoutStore()
    const persona = await store.getContentPersona(personaId)
    if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const generatedToday = await store.countContentDraftsToday(personaId)
    if (generatedToday >= 2) {
      return NextResponse.json({ error: 'Daily cap reached: up to 2 generated drafts per persona.' }, { status: 429 })
    }

    const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null
    const memories = await store.listContentMemories(personaId, { limit: 50 })

    // ── Build source material from seed + grounding ─────────────────────
    const sourceMaterial = buildSourceMaterial({
      idea,
      angle,
      contentType,
      groundingType,
      confirmedOpinion,
      direction,
    })

    // ── Build context blocks ────────────────────────────────────────────
    const contentDnaBlock = buildContentDnaPromptBlock(profile)
    const memoryBlock = buildMemoryPromptBlock(memories)

    let styleCard: string | null = null
    if (persona.voiceProfileId) {
      const voiceProfile = await store.getVoiceProfile()
      if (voiceProfile) styleCard = injectStyleCard(voiceProfile.styleCard)
    }

    const history = await store.listContentHistory(personaId, 10)
    const recentOpenings = history.map((h) => h.openingLine).filter(Boolean)
    const recentStructures = history
      .map((h) => h.openingLine)
      .filter(Boolean)
      .map(() => 'observation') as string[]

    // ── Construct genome ────────────────────────────────────────────────
    const genomeResult = await constructIdeaGenome({
      sourceMaterial,
      topic: idea.slice(0, 50),
      profile,
      memories,
      opportunity: null,
      interviewAnswers: confirmedOpinion ? [confirmedOpinion] : [],
    })

    const genomeQualified = genomeResult.qualification.qualified

    // ── Even if genome says "not qualified", proceed with adjusted grounding ──
    // This implements the "never block on personal evidence" principle
    const genomeBlock = buildGenomePromptBlock(genomeResult.genome, sourceMaterial)

    // ── Performance + Research ──────────────────────────────────────────
    const performanceInsights = analyzePerformance(history)
    const performanceBlock = buildPerformancePromptBlock(performanceInsights)

    const researchDecision = requiresResearch({
      sourceMaterial,
      genomeSource: genomeResult.genome.source,
      supportingFacts: genomeResult.genome.supportingFacts,
    })
    let researchBlock = ''
    if (researchDecision.shouldResearch) {
      const sources = await performResearch(noopResearchProvider, genomeResult.genome.topic)
      researchBlock = buildResearchPromptBlock({
        shouldResearch: true,
        reason: researchDecision.reason,
        sources,
        constraints: sources.length === 0 ? generateConstraints(sourceMaterial) : [],
      })
    }

    // ── Run the forge ───────────────────────────────────────────────────
    const forgeResult = await runContentForge({
      personaName: persona.displayName,
      platform,
      sourceMaterial,
      styleCard,
      humorStyle: persona.humorStyle,
      valuesAndOpinions: persona.valuesAndOpinions,
      contentDnaBlock,
      genomeBlock,
      memoryBlock,
      recentOpenings,
      recentStructures: [],
      generationMode: groundingType === 'personal_grounded' ? 'personal' : 'opinion',
      performanceBlock,
      researchBlock,
    })

    // ── Store draft ─────────────────────────────────────────────────────
    const draft = await store.createContentDraft({
      personaId,
      pillarId: null,
      topicClusterId: null,
      sourceKind: confirmedOpinion ? 'conviction' : 'answer',
      sourceMaterial,
      platform,
      caption: forgeResult.caption,
      hookScore: Math.round(forgeResult.evaluation.quality * 10),
      hookFeedback: `Winner: ${forgeResult.winner}, Quality: ${forgeResult.evaluation.quality}`,
      selfCheckPassed: forgeResult.evaluation.slopScore < 0.5,
      selfCheckNote: forgeResult.evaluation.notes.join('; '),
      specificityHit: forgeResult.evaluation.specificity > 0.5,
      status: forgeResult.evaluation.quality > 0.5 && forgeResult.evaluation.slopScore < 0.5 ? 'ready' : 'draft',
    })

    // ── Store evaluation ────────────────────────────────────────────────
    await store.createEvaluation({
      draftId: draft.id,
      originality: forgeResult.evaluation.quality,
      personalSpecificity: forgeResult.evaluation.specificity,
      usefulness: genomeResult.qualification.relevance,
      credibility: genomeResult.qualification.evidenceStrength,
      evidence: genomeResult.qualification.evidenceStrength,
      clarity: 0.7,
      storytelling: forgeResult.evaluation.quality,
      voiceMatch: 0.7,
      stopPotential: forgeResult.evaluation.distribution,
      dwellPotential: forgeResult.evaluation.distribution,
      commentPotential: genomeResult.qualification.conversationPotential,
      savePotential: forgeResult.evaluation.distribution * 0.8,
      sharePotential: forgeResult.evaluation.distribution * 0.7,
      audienceRelevance: genomeResult.qualification.relevance,
      slopScore: forgeResult.evaluation.slopScore,
      genericProbability: forgeResult.evaluation.slopScore,
    })

    // ── Record memories ─────────────────────────────────────────────────
    const draftMemories = extractMemoriesFromDraft(forgeResult.caption, forgeResult.hook)
    for (const mem of draftMemories) {
      await store.createContentMemory({
        personaId,
        memoryType: mem.type,
        content: mem.content,
        sourceDraftId: draft.id,
      })
    }

    // ── Record taste signal (write_this) ────────────────────────────────
    try {
      const storedTaste = await store.getTasteProfile(personaId)
      const { createTasteProfile, applyTasteSignal } = await import('@/lib/content/intelligence/v2/taste')
      const tp = storedTaste ? {
        personaId: storedTaste.personaId,
        preferences: storedTaste.preferences,
        territoryAffinity: storedTaste.territoryAffinity,
        totalInteractions: storedTaste.totalInteractions,
        lastUpdated: storedTaste.lastSignalAt ?? new Date().toISOString(),
        shortTerm: storedTaste.shortTerm,
        shortTermWeight: storedTaste.shortTermWeight,
      } : createTasteProfile(personaId)
      const updated = applyTasteSignal(tp, {
        type: 'write_this',
        territory: territoryFromContentType(contentType, groundingType),
        contentType: contentType as 'technical' | 'opinion' | 'human' | 'educational' | 'timely' | 'observation',
        metadata: {
          wasTechnical: contentType === 'technical',
          wasOpinion: contentType === 'opinion' || !!confirmedOpinion,
          wasTimely: contentType === 'timely',
          wasPersonal: groundingType === 'personal_grounded',
        },
        idempotencyKey: `generate:${personaId}:${genomeResult.genome.topic.slice(0, 40)}`,
      })
      await store.saveTasteProfile(personaId, {
        preferences: updated.preferences,
        territoryAffinity: updated.territoryAffinity,
        totalInteractions: updated.totalInteractions,
        shortTerm: updated.shortTerm,
        shortTermWeight: updated.shortTermWeight,
        lastSignalType: 'write_this',
        lastSignalKey: `generate:${personaId}:${genomeResult.genome.topic.slice(0, 40)}`,
      })
    } catch {
      // Taste recording is best-effort; don't fail the request
    }

    return NextResponse.json({
      draft: {
        id: draft.id,
        caption: draft.caption,
        platform: draft.platform,
        hookScore: draft.hookScore,
        status: draft.status,
        createdAt: draft.createdAt,
        evaluation: {
          quality: forgeResult.evaluation.quality,
          distribution: forgeResult.evaluation.distribution,
          specificity: forgeResult.evaluation.specificity,
          slopScore: forgeResult.evaluation.slopScore,
        },
        genome: {
          topic: genomeResult.genome.topic,
          angle: genomeResult.genome.angle,
          archetype: genomeResult.genome.archetype,
          source: genomeResult.genome.source,
        },
        structure: forgeResult.structure,
        winner: forgeResult.winner,
        visualConcept: forgeResult.visualConcept ?? null,
      },
    })
  } catch (err) {
    console.error('[content/intelligence/v2/generate] failed:', err)
    return safeErrorResponse(err, 500, 'Generation failed.', 'content/intelligence/v2/generate')
  }
}

/**
 * Build source material from the selected seed.
 * This is what gets fed into the forge as the "real material".
 * We never fabricate — we frame what CAN be said based on the grounding type.
 */
function buildSourceMaterial(params: {
  idea: string
  angle: string
  contentType: ContentType
  groundingType: GroundingType
  confirmedOpinion?: string
  direction?: string
}): string {
  const { idea, angle, contentType, groundingType, confirmedOpinion, direction } = params

  const parts: string[] = []

  // The core idea
  parts.push(`Topic: ${idea}`)
  parts.push(`Angle: ${angle}`)

  if (direction) {
    parts.push(`Direction: ${direction}`)
  }

  // Grounding-specific framing
  switch (groundingType) {
    case 'personal_grounded':
      parts.push('Mode: Personal experience. Write from real events. Do not invent specifics.')
      break
    case 'opinion_confirmed':
      parts.push('Mode: Confirmed opinion. This is a belief the user holds. Express it with reasoning.')
      if (confirmedOpinion) {
        parts.push(`Confirmed opinion: ${confirmedOpinion}`)
      }
      break
    case 'expertise_grounded':
      parts.push('Mode: Expertise-based. Draw from professional knowledge. No personal anecdotes needed.')
      break
    case 'research_grounded':
      parts.push('Mode: Research-informed. Use current facts and developments. Cite sources where possible.')
      break
    case 'general_educational':
      parts.push('Mode: Educational. Teach something useful from general engineering knowledge.')
      break
    case 'creative_observation':
      parts.push('Mode: Observation. Share an insightful observation. Universal truth, no fabrication.')
      break
  }

  return parts.join('\n')
}

function territoryFromContentType(contentType: string, groundingType: string): string | undefined {
  if (contentType === 'technical') return 'core_expertise'
  if (contentType === 'opinion') return 'opinions'
  if (contentType === 'human') return 'human_observations'
  if (contentType === 'educational') return 'learning'
  if (contentType === 'timely') return 'timely_developments'
  if (contentType === 'observation') return 'curiosity'
  if (groundingType === 'personal_grounded') return 'learning'
  return undefined
}
