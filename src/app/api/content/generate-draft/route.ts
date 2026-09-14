import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'
import { generateContent } from '@/lib/ai/content'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import { checkBannedPhrases, checkBadHook } from '@/lib/ai/content'
import { evaluatePostQuality, isRegressionFixture } from '@/lib/content/quality-gate'
import { buildPostPlan, validateCoreInsight } from '@/lib/content/post-plan'
import { generateVisualConcept } from '@/lib/writing/visual'
import { structuredJsonChain } from '@/lib/ai/provider'
import { pickDraftChain, tier0Host } from '@/lib/ai/routing'
import type { ContentDraft, ContentMemory, ContentIdeaCard } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

interface GenerateBody {
  personaId: string
  idea: {
    title: string
    angle: string
    territory: string
    sourceKind: string
    whyYou?: string
    whyAudience?: string
  }
  platform?: 'linkedin' | 'x' | 'instagram'
}

/**
 * POST /api/content/generate-draft
 * Single generation path. Persists draft, returns draft ID.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body: GenerateBody = await req.json().catch(() => null)
  if (!body?.personaId || !body?.idea) {
    return NextResponse.json({ error: 'personaId and idea required' }, { status: 400 })
  }

  const store = await createScoutStore()
  const persona = await store.getContentPersona(body.personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null
  const memories = await store.listContentMemories(body.personaId, { limit: 50 })
  const history = await store.listContentHistory(body.personaId, 20)

  // Build the prompt context
  const platform = body.platform ?? persona.platforms[0] ?? 'linkedin'

  // Check memory for similar topics
  const usedTopics = memories
    .filter((m) => m.memoryType === 'topic_covered')
    .map((m) => m.content)
  const usedHooks = memories
    .filter((m) => m.memoryType === 'hook_used')
    .map((m) => m.content)

  // Generate the post
  let caption = ''
  let selfCheckPassed = false
  let selfCheckNote = ''
  let hookScore = 5
  let hookFeedback = ''

  try {
    const result = await generateContent({
      personaName: persona.displayName,
      topic: { id: body.idea.territory, name: body.idea.title, description: body.idea.angle },
      sourceMaterial: buildSourceMaterial(body.idea, profile, history),
      platform: platform as 'linkedin' | 'x',
      styleCard: profile ? buildStyleCard(profile, persona) : null,
      recentOpenings: usedHooks.slice(0, 5),
      humorStyle: persona.humorStyle || undefined,
      valuesAndOpinions: profile?.opinions?.map((o) => o.belief) || [],
      generationMode: 'personal',
      contentDnaBlock: profile ? buildDnaBlock(profile) : null,
    })

    caption = result.caption.trim()
    hookScore = result.hookScore
    hookFeedback = result.hookFeedback
    selfCheckPassed = result.selfCheckPassed
    selfCheckNote = result.selfCheckNote

    // Apply humanization fixes if needed
    if (!result.humanizationPassed) {
      const rewritten = rewriteToHumanize(caption, result.humanizationTells)
      if (rewritten !== caption) caption = rewritten
    }
  } catch (err) {
    console.error('[generate-draft] generation failed:', err)
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 })
  }

  if (!caption || caption.length < 20) {
    return NextResponse.json({ error: 'Generated content too short. Please try a different angle.' }, { status: 500 })
  }

  // Quick regression fixture check
  if (isRegressionFixture(caption)) {
    return NextResponse.json({
      error: 'Generated content failed quality checks: contains fabricated experience and generic insight. Please try a different angle.',
      qualityFailures: ['UNSUPPORTED_PERSONAL_CLAIM', 'GENERIC_INSIGHT', 'LOW_INFORMATION_DENSITY', 'MALFORMED_SOURCE_HANDLING'],
    }, { status: 422 })
  }

  // Comprehensive quality gate
  const qualityResult = evaluatePostQuality({
    caption,
    personaContext: {
      expertise: profile?.expertise?.map((e: any) => e.area) ?? [],
      audiences: profile?.audiences ?? [],
      goals: profile?.contentGoals ?? [],
      projects: profile?.projects?.map((p: any) => p.name) ?? [],
      opinions: profile?.opinions?.map((o: any) => o.belief) ?? [],
      territories: profile?.territories ?? [],
    },
    sourceMaterial: buildSourceMaterial(body.idea, profile, history),
    platform,
  })

  let qualityPassed = qualityResult.passed
  let finalCaption = caption

  // Corrective retry on quality failure
  if (!qualityPassed) {
    const correctionResult = await attemptCorrectiveRetry(
      caption,
      qualityResult,
      body,
      profile,
      persona,
      usedHooks,
      platform as string,
    )
    if (correctionResult && correctionResult.passed) {
      finalCaption = correctionResult.caption
      qualityPassed = true
    }
  }

  caption = finalCaption

  // Generate visual concept
  const concept = generateVisualConcept({
    postText: caption,
    platform: platform as 'linkedin' | 'x',
    angle: body.idea.angle,
    topic: body.idea.title,
    coreDetail: body.idea.angle.slice(0, 100),
    tone: 'confident',
  })

  // Persist the draft
  let draft: ContentDraft
  try {
    draft = await store.createContentDraft({
      personaId: body.personaId,
      platform: platform as 'linkedin' | 'x',
      sourceKind: 'idea',
      sourceMaterial: body.idea.title,
      caption,
      hookScore,
      hookFeedback,
      selfCheckPassed: qualityPassed,
      selfCheckNote: qualityPassed ? 'Passed quality gates' : selfCheckNote,
      specificityHit: qualityResult.warnings.length === 0,
      status: qualityPassed ? 'ready' : 'draft',
    })
  } catch (err) {
    console.error('[generate-draft] persistence failed:', err)
    // Return generated content so user doesn't lose it
    return NextResponse.json({
      error: 'Could not save draft. Your content is preserved below.',
      caption,
      visualIdea: concept.visualIdea,
      imagePrompt: concept.imagePrompt,
    }, { status: 500 })
  }

  // Record memories asynchronously (don't block response)
  const hook = caption.split('\n')[0]?.slice(0, 80) ?? ''
  store.createContentMemory({
    personaId: body.personaId,
    memoryType: 'topic_covered',
    content: body.idea.title.slice(0, 80),
    sourceDraftId: draft.id,
  }).catch(() => {})
  if (hook) {
    store.createContentMemory({
      personaId: body.personaId,
      memoryType: 'hook_used',
      content: hook,
      sourceDraftId: draft.id,
    }).catch(() => {})
  }

  return NextResponse.json({
    draftId: draft.id,
    caption,
    hookScore,
    selfCheckPassed: qualityPassed,
    visualIdea: concept.visualIdea,
    imagePrompt: concept.imagePrompt,
    platform,
  })
}

function buildSourceMaterial(idea: GenerateBody['idea'], profile: any, history: any[]): string {
  const parts: string[] = []
  parts.push(`Topic: ${idea.title}`)
  parts.push(`Angle: ${idea.angle}`)
  if (idea.whyYou) parts.push(`Why this person: ${idea.whyYou}`)
  if (idea.whyAudience) parts.push(`Why audience cares: ${idea.whyAudience}`)

  if (profile) {
    if (profile.role) parts.push(`Person role: ${profile.role}`)
    if (profile.expertise?.length) {
      parts.push(`Expertise: ${profile.expertise.slice(0, 4).map((e: any) => e.area).join(', ')}`)
    }
  }

  return parts.join('\n')
}

function buildStyleCard(profile: any, persona: any): string {
  const parts: string[] = []
  if (persona.humorStyle) parts.push(`Voice: ${persona.humorStyle}`)
  if (profile?.role) parts.push(`Writing as: ${profile.role}`)
  if (profile?.writingCharacteristics?.sentenceRhythm) {
    parts.push(`Rhythm: ${profile.writingCharacteristics.sentenceRhythm}`)
  }
  return parts.join('. ')
}

function buildDnaBlock(profile: any): string {
  const parts: string[] = []
  if (profile.role) parts.push(`Role: ${profile.role} (${profile.seniority})`)
  if (profile.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
  if (profile.audience) parts.push(`Audience: ${profile.audience}`)
  if (profile.expertise?.length) {
    parts.push(`Expertise: ${profile.expertise.slice(0, 5).map((e: any) => `${e.area} (${e.level})`).join(', ')}`)
  }
  if (profile.opinions?.length) {
    parts.push(`Opinions: ${profile.opinions.slice(0, 3).map((o: any) => o.belief).join(' | ')}`)
  }
  if (profile.projects?.length) {
    parts.push(`Projects: ${profile.projects.slice(0, 3).map((p: any) => p.name).join(', ')}`)
  }
  return parts.join('\n')
}

/**
 * Attempts corrective retry when quality gate fails.
 * Uses Groq strong for corrective rewrite with targeted instructions.
 */
async function attemptCorrectiveRetry(
  originalCaption: string,
  qualityResult: { passed: boolean; failures: { code: string; message: string }[]; warnings: { code: string; message: string }[]; scores: any },
  body: any,
  profile: any,
  persona: any,
  usedHooks: string[],
  platform: string,
): Promise<{ caption: string; passed: boolean; retries: number } | null> {
  // Build targeted correction instructions
  const failureCodes = qualityResult.failures.map((f) => f.code)
  const failureMessages = qualityResult.failures.map((f) => f.message)

  const correctionInstructions = buildCorrectionPrompt(failureCodes, failureMessages, body.idea, profile)

  // Try Groq strong for corrective rewrite
  const groqHost = tier0Host('strong')
  if (!groqHost) return null

  try {
    const result = await structuredJsonChain<{ caption: string }>(
      [{ costTier: 'tier1', host: groqHost }],
      {
        system: buildCorrectionSystemPrompt(profile, body),
        user: buildCorrectionUserPrompt(correctionInstructions, originalCaption, body.idea, platform),
        schema: {
          type: 'object',
          properties: {
            caption: { type: 'string', description: 'The rewritten post' },
          },
          required: ['caption'],
        },
      },
    )

    const newCaption = result.data.caption.trim()

    // Re-evaluate
    const newQuality = evaluatePostQuality({
      caption: newCaption,
      personaContext: {
        expertise: profile?.expertise?.map((e: any) => e.area) ?? [],
        audiences: profile?.audiences ?? [],
        goals: profile?.contentGoals ?? [],
        projects: profile?.projects?.map((p: any) => p.name) ?? [],
        opinions: profile?.opinions?.map((o: any) => o.belief) ?? [],
        territories: profile?.territories ?? [],
      },
      sourceMaterial: buildSourceMaterial(body.idea, profile, []),
      platform,
    })

    return { caption: newCaption, passed: newQuality.passed, retries: 1 }
  } catch {
    return null
  }
}

function buildCorrectionPrompt(failureCodes: string[], failureMessages: string[], idea: any, profile: any): string {
  const parts: string[] = []

  parts.push('The previous draft failed quality checks:')
  parts.push('')

  for (const code of failureCodes) {
    switch (code) {
      case 'UNSUPPORTED_PERSONAL_CLAIM':
        parts.push('- REMOVE all invented personal anecdotes, team stories, or client interactions.')
        parts.push('  Only use experiences explicitly confirmed in the Persona profile.')
        break
      case 'GENERIC_INSIGHT':
        parts.push('- REMOVE generic motivational statements.')
        parts.push('  Add a specific mechanism, tradeoff, or non-obvious distinction.')
        break
      case 'LOW_INFORMATION_DENSITY':
        parts.push('- REMOVE repetitive statements. Each sentence should add new information.')
        break
      case 'LOW_INFORMATION_GAIN':
        parts.push('- ADD substantive content: a specific mechanism, useful heuristic, concrete example, or meaningful tradeoff.')
        break
      case 'MALFORMED_SOURCE_HANDLING':
        parts.push('- FIX garbled or misspelled words. Do not build insights around malformed text.')
        break
      case 'WEAK_PERSONA_FIT':
        parts.push('- GROUND the post in the verified Persona expertise and experience.')
        break
    }
  }

  parts.push('')
  parts.push('REQUIREMENTS:')
  parts.push('- Keep the original topic and angle.')
  parts.push('- Do not invent personal experiences, client names, or team events.')
  parts.push('- Use verified expertise from the Persona profile.')
  parts.push('- Provide at least one specific, non-obvious insight.')
  parts.push('- End naturally without forced inspirational conclusion.')

  return parts.join('\n')
}

function buildCorrectionSystemPrompt(profile: any, body: any): string {
  const parts: string[] = []
  parts.push('You are a professional social media writer rewriting a post that failed quality checks.')
  parts.push('')
  if (profile) {
    if (profile.role) parts.push(`Person: ${profile.role} (${profile.seniority})`)
    if (profile.expertise?.length) {
      parts.push(`Expertise: ${profile.expertise.slice(0, 5).map((e: any) => `${e.area} (${e.level})`).join(', ')}`)
    }
    if (profile.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
  }
  parts.push('')
  parts.push('HARD RULES:')
  parts.push('- Never fabricate personal experiences, client interactions, or team events.')
  parts.push('- Only claim what is explicitly supported by verified Persona context.')
  parts.push('- No generic motivational conclusions.')
  parts.push('- No unsupported first-person or third-person event claims.')
  return parts.join('\n')
}

function buildCorrectionUserPrompt(instructions: string, originalCaption: string, idea: any, platform: string): string {
  return `${instructions}

ORIGINAL POST (failed):
"""
${originalCaption}
"""

TOPIC: ${idea.title}
ANGLE: ${idea.angle}
PLATFORM: ${platform}

Rewrite the post to fix all listed issues. Output ONLY a JSON object with a "caption" field.`
}


