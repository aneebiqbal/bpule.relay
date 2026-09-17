import { NextRequest, NextResponse } from 'next/server'
import { safeErrorResponse } from '@/lib/errors'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { buildContentDnaPromptBlock, extractDnaCandidatesFromAnswer, mergeDnaCandidates, calculateProfileConfidence } from '@/lib/content/content-dna'
import { buildMemoryPromptBlock, extractMemoriesFromDraft, checkMemoryForDuplicates, extractMemoriesFromIdea } from '@/lib/content/intelligence/memory'
import { constructIdeaGenome, buildGenomePromptBlock } from '@/lib/content/intelligence/genome'
import { runContentForge } from '@/lib/content/intelligence/forge'
import { analyzePerformance, buildPerformancePromptBlock } from '@/lib/content/intelligence/performance'
import { findMostSimilar, areEmbeddingsEnabled } from '@/lib/content/intelligence/semantic'
import { requiresResearch, buildResearchPromptBlock, generateConstraints, noopResearchProvider, performResearch } from '@/lib/content/intelligence/research'
import { injectStyleCard } from '@/lib/style/inject'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/intelligence/forge
 * Body: { personaId, sourceMaterial, platform, opportunityId?, interviewAnswers? }
 * Returns: { draft: { ... } }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { personaId, sourceMaterial, platform, opportunityId, interviewAnswers } = body as {
      personaId: string
      sourceMaterial: string
      platform: 'linkedin' | 'x'
      opportunityId?: string | null
      interviewAnswers?: string[]
    }

    if (!sourceMaterial?.trim()) {
      return NextResponse.json({ error: 'sourceMaterial is required' }, { status: 400 })
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
  const opportunity = opportunityId ? await store.getContentOpportunity(opportunityId) : null
  if (opportunity && opportunity.personaId !== personaId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const contentDnaBlock = buildContentDnaPromptBlock(profile)
  const memoryBlock = buildMemoryPromptBlock(memories)

  let styleCard: string | null = null
  if (persona.voiceProfileId) {
    const voiceProfile = await store.getVoiceProfile()
    if (voiceProfile) styleCard = injectStyleCard(voiceProfile.styleCard)
  }

  const history = await store.listContentHistory(personaId, 10)
  const recentOpenings = history.map((h) => h.openingLine).filter(Boolean)

  // Construct idea genome
  const genomeResult = await constructIdeaGenome({
    sourceMaterial,
    topic: opportunity?.title ?? 'General',
    profile,
    memories,
    opportunity,
    interviewAnswers,
  })

  if (!genomeResult.qualification.qualified) {
    return NextResponse.json({
      error: 'This idea needs more specific material before generation.',
      reason: genomeResult.qualification.rejectionReason,
      suggestion: 'Try adding a specific detail, example, or personal experience.',
      genome: genomeResult.genome,
    }, { status: 422 })
  }

  let genomeBlock = buildGenomePromptBlock(genomeResult.genome, sourceMaterial)

  // Check for duplicate ideas using memory
  const dupCheck = checkMemoryForDuplicates(sourceMaterial, memories, 0.7)
  if (dupCheck.isDuplicate) {
    genomeBlock += `\n\nWARNING: This idea is very similar to previous content: "${dupCheck.similarMemories[0]?.content.slice(0, 100)}". Consider a different angle or more specific detail.`
  }

  // Find most similar previous post for context
  const memoryContents = memories.map((m) => m.content)
  const mostSimilar = findMostSimilar(sourceMaterial, memoryContents)
  if (mostSimilar && mostSimilar.similarity > 0.5) {
    genomeBlock += `\n\nMOST SIMILAR PREVIOUS POST: "${mostSimilar.content.slice(0, 150)}" — differentiate from this.`
  }

  // Note embedding availability for semantic similarity
  if (areEmbeddingsEnabled()) {
    genomeBlock += '\n\nSEMANTIC SIMILARITY: Embeddings enabled for duplicate detection.'
  }

  // Performance learning: derive patterns from history
  const performanceInsights = analyzePerformance(history)
  const performanceBlock = buildPerformancePromptBlock(performanceInsights)

  // Research layer: determine if external evidence is needed
  const researchDecision = requiresResearch({
    sourceMaterial,
    genomeSource: genomeResult.genome.source,
    supportingFacts: genomeResult.genome.supportingFacts,
  })
  let researchBlock = ''
  if (researchDecision.shouldResearch) {
    // Attempt research if a provider is available
    const sources = await performResearch(noopResearchProvider, genomeResult.genome.topic)
    researchBlock = buildResearchPromptBlock({
      shouldResearch: true,
      reason: researchDecision.reason,
      sources,
      constraints: sources.length === 0 ? generateConstraints(sourceMaterial) : [],
    })
  }

  // Store genome
  const genome = await store.createIdeaGenome({
    personaId,
    source: genomeResult.genome.source,
    topic: genomeResult.genome.topic,
    angle: genomeResult.genome.angle,
    archetype: genomeResult.genome.archetype,
    audience: genomeResult.genome.audience,
    emotion: genomeResult.genome.emotion,
    valueType: genomeResult.genome.valueType,
    opportunityId: opportunity?.id ?? null,
  })
  await store.updateIdeaGenome(genome.id, {
    novelty: genomeResult.qualification.novelty,
    evidenceStrength: genomeResult.qualification.evidenceStrength,
    personalSpecificity: genomeResult.qualification.personalSpecificity,
    relevance: genomeResult.qualification.relevance,
    conversationPotential: genomeResult.qualification.conversationPotential,
    status: 'in_forge',
  })

  // Run the forge
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
    generationMode: 'personal',
    performanceBlock,
    researchBlock,
  })

  // Store draft first (needed for evaluation FK)
  const draft = await store.createContentDraft({
    personaId,
    pillarId: null,
    topicClusterId: null,
    sourceKind: 'answer',
    sourceMaterial,
    platform,
    caption: forgeResult.caption,
    hookScore: Math.round(forgeResult.evaluation.quality * 10),
    hookFeedback: `Winner: ${forgeResult.winner}, Quality: ${forgeResult.evaluation.quality}`,
    selfCheckPassed: true,
    selfCheckNote: (forgeResult.evaluation.notes ?? []).join('; '),
    specificityHit: forgeResult.evaluation.specificity > 0.5,
    status: forgeResult.evaluation.quality > 0.5 && forgeResult.evaluation.slopScore < 0.5 ? 'ready' : 'draft',
  })

  // Store evaluation linked to draft
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

  await store.updateIdeaGenome(genome.id, { draftId: draft.id, status: 'published' })

  // Update Content DNA from interview answers and source material
  if (persona.contentProfileId && interviewAnswers && interviewAnswers.length > 0) {
    const allCandidates = [...interviewAnswers, sourceMaterial]
      .flatMap((text) => extractDnaCandidatesFromAnswer(text, profile))
    if (allCandidates.length > 0 && profile) {
      const patches = mergeDnaCandidates(profile, allCandidates)
      const hasPatches = patches.experiences.length > 0 || patches.opinions.length > 0 || patches.expertise.length > 0 || patches.topicsCared.length > 0
      if (hasPatches) {
        await store.updateContentProfile(persona.contentProfileId, {
          experiences: [...profile.experiences, ...patches.experiences],
          opinions: [...profile.opinions, ...patches.opinions],
          expertise: [...profile.expertise, ...patches.expertise],
          topicsCared: [...profile.topicsCared, ...patches.topicsCared],
          confidence: calculateProfileConfidence({
            ...profile,
            experiences: [...profile.experiences, ...patches.experiences],
            opinions: [...profile.opinions, ...patches.opinions],
            expertise: [...profile.expertise, ...patches.expertise],
            topicsCared: [...profile.topicsCared, ...patches.topicsCared],
          }),
        })
      }
    }
  }

  // Record memories from draft and idea
  const draftMemories = extractMemoriesFromDraft(forgeResult.caption, forgeResult.hook)
  const ideaMemories = extractMemoriesFromIdea(sourceMaterial, genomeResult.genome.angle)
  const allNewMemories = [...draftMemories, ...ideaMemories]
  for (const mem of allNewMemories) {
    await store.createContentMemory({
      personaId,
      memoryType: mem.type,
      content: mem.content,
      sourceDraftId: draft.id,
    })
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
        audience: genomeResult.genome.audience,
        source: genomeResult.genome.source,
      },
      winner: forgeResult.winner,
      qualityNotes: forgeResult.evaluation.notes,
    },
  })
  } catch (err) {
    console.error('[content/intelligence/forge] failed:', err)
    return safeErrorResponse(err, 500, 'Generation failed.', 'content/intelligence/forge')
  }
}
