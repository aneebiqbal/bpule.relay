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
import { pickDraftChain, tier0Hosts, tier4Host, shouldEscalateToPremium } from '@/lib/ai/routing'
import type { ContentDraft, ContentMemory, ContentIdeaCard } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
  const journey = await store.listContentJourney?.(body.personaId, 10) ?? []

  const platform = body.platform ?? persona.platforms[0] ?? 'linkedin'

  // Check memory for similar topics
  const usedHooks = memories
    .filter((m) => m.memoryType === 'hook_used')
    .map((m) => m.content)

  // ── Step 1: Build PostPlan ────────────────────────────────────────────
  const idea: ContentIdeaCard = {
    id: `idea-${Date.now()}`,
    title: body.idea.title,
    angle: body.idea.angle,
    territory: body.idea.territory,
    sourceKind: body.idea.sourceKind as ContentIdeaCard['sourceKind'],
    whyYou: body.idea.whyYou ?? '',
    whyAudience: body.idea.whyAudience ?? '',
    confidence: 0.7,
  }

  const postPlan = buildPostPlan({
    idea,
    profile,
    journey,
    platform: platform as 'linkedin' | 'x' | 'instagram',
  })

  // ── Step 2: Validate Core Insight ─────────────────────────────────────
  const insightCheck = validateCoreInsight(postPlan.coreInsight)
  if (!insightCheck.valid) {
    return NextResponse.json({
      error: `This idea needs a stronger core insight. ${insightCheck.reason}. Try a more specific angle.`,
      coreInsight: postPlan.coreInsight,
      suggestion: 'Add a specific mechanism, tradeoff, non-obvious distinction, or concrete example.',
    }, { status: 422 })
  }

  // ── Step 3: Generate with PostPlan context ────────────────────────────
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
      styleCard: buildEnhancedStyleCard(profile, persona, postPlan),
      recentOpenings: usedHooks.slice(0, 5),
      humorStyle: persona.humorStyle || undefined,
      valuesAndOpinions: profile?.opinions?.map((o) => o.belief) || [],
      generationMode: 'personal',
      contentDnaBlock: buildEnhancedDnaBlock(profile, postPlan),
      postPlan,
    })

    caption = result.caption.trim()
    hookScore = result.hookScore
    hookFeedback = result.hookFeedback
    selfCheckPassed = result.selfCheckPassed
    selfCheckNote = result.selfCheckNote

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
      role: profile?.role ?? '',
    },
    sourceMaterial: buildSourceMaterial(body.idea, profile, history),
    platform,
  })

  let qualityPassed = qualityResult.passed
  let finalCaption = caption
  const retryStats = { longcatFirstPass: qualityResult.passed ? 1 : 0, groqRetry: 0, gptEscalation: 0 }

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
      postPlan,
    )
    if (correctionResult && correctionResult.passed) {
      finalCaption = correctionResult.caption
      qualityPassed = true
      if (correctionResult.method === 'groq') retryStats.groqRetry = 1
      if (correctionResult.method === 'gpt') retryStats.gptEscalation = 1
    }
  }

  caption = finalCaption

  // NEVER persist a draft that failed quality gates
  if (!qualityPassed) {
    return NextResponse.json({
      error: 'Generated content did not meet quality standards after retry. Please try a different angle.',
      qualityFailures: qualityResult.failures.map((f) => f.code),
      qualityWarnings: qualityResult.warnings.map((w) => w.code),
      scores: qualityResult.scores,
      retryStats,
    }, { status: 422 })
  }

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
    retryStats,
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

function buildEnhancedStyleCard(profile: any, persona: any, postPlan: any): string {
  const parts: string[] = []
  if (persona.humorStyle) parts.push(`Voice: ${persona.humorStyle}`)
  if (profile?.role) parts.push(`Writing as: ${profile.role}`)
  if (postPlan.voice) parts.push(`Rhythm: ${postPlan.voice}`)
  if (postPlan.structure) parts.push(`Structure: ${postPlan.structure}`)
  return parts.join('. ')
}

function buildEnhancedDnaBlock(profile: any, postPlan: any): string {
  const parts: string[] = []
  if (profile) {
    if (profile.role) parts.push(`Role: ${profile.role} (${profile.seniority})`)
    if (profile.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
    if (profile.expertise?.length) {
      parts.push(`Verified expertise: ${profile.expertise.slice(0, 5).map((e: any) => `${e.area} (${e.level})`).join(', ')}`)
    }
  }
  if (postPlan.coreInsight) parts.push(`Core insight: ${postPlan.coreInsight}`)
  if (postPlan.groundingMode) parts.push(`Grounding: ${postPlan.groundingMode}`)
  if (postPlan.allowedPersonalClaims.length > 0) {
    parts.push(`ALLOWED personal claims:\n- ${postPlan.allowedPersonalClaims.join('\n- ')}`)
  }
  if (postPlan.forbiddenClaims.length > 0) {
    parts.push(`FORBIDDEN claims:\n- ${postPlan.forbiddenClaims.join('\n- ')}`)
  }
  return parts.join('\n')
}

/**
 * Attempts corrective retry when quality gate fails.
 * LongCat → Groq strong corrective rewrite → GPT escalation (rare).
 * Returns the corrected caption with method used, or null if all attempts fail.
 */
async function attemptCorrectiveRetry(
  originalCaption: string,
  qualityResult: { passed: boolean; failures: { code: string; message: string }[]; warnings: { code: string; message: string }[]; scores: any },
  body: any,
  profile: any,
  persona: any,
  usedHooks: string[],
  platform: string,
  postPlan: any,
): Promise<{ caption: string; passed: boolean; method: 'groq' | 'gpt' } | null> {
  const failureCodes = qualityResult.failures.map((f) => f.code)
  const correctionInstructions = buildCorrectionPrompt(failureCodes, qualityResult.failures.map((f) => f.message), body.idea, profile, postPlan)

  // Attempt 1: Groq strong corrective rewrite (tries both keys if available)
  const groqHosts = tier0Hosts('strong')
  if (groqHosts.length > 0) {
    try {
      const result = await structuredJsonChain<{ caption: string }>(
        groqHosts.map((host) => ({ costTier: 'tier1', host })),
        {
          system: buildCorrectionSystemPrompt(profile, body, postPlan),
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
      const newQuality = evaluatePostQuality({
        caption: newCaption,
        personaContext: {
          expertise: profile?.expertise?.map((e: any) => e.area) ?? [],
          audiences: profile?.audiences ?? [],
          goals: profile?.contentGoals ?? [],
          projects: profile?.projects?.map((p: any) => p.name) ?? [],
          opinions: profile?.opinions?.map((o: any) => o.belief) ?? [],
          territories: profile?.territories ?? [],
          role: profile?.role ?? '',
        },
        sourceMaterial: buildSourceMaterial(body.idea, profile, []),
        platform,
      })

      if (newQuality.passed) {
        return { caption: newCaption, passed: true, method: 'groq' }
      }
    } catch {
      // Groq failed, try GPT escalation
    }
  }

  // Attempt 2: GPT escalation (only when cheaper tiers fail)
  const gptHost = tier4Host()
  if (gptHost && shouldEscalateToPremium({
    primaryPassed: false,
    primaryScore: qualityResult.scores?.insightDepth ?? 0,
    isHighValue: true,
    malformedOutput: false,
    attemptCount: 1,
  }).shouldEscalate) {
    try {
      const result = await structuredJsonChain<{ caption: string }>(
        [{ costTier: 'tier4', host: gptHost }],
        {
          system: buildCorrectionSystemPrompt(profile, body, postPlan),
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
      const newQuality = evaluatePostQuality({
        caption: newCaption,
        personaContext: {
          expertise: profile?.expertise?.map((e: any) => e.area) ?? [],
          audiences: profile?.audiences ?? [],
          goals: profile?.contentGoals ?? [],
          projects: profile?.projects?.map((p: any) => p.name) ?? [],
          opinions: profile?.opinions?.map((o: any) => o.belief) ?? [],
          territories: profile?.territories ?? [],
          role: profile?.role ?? '',
        },
        sourceMaterial: buildSourceMaterial(body.idea, profile, []),
        platform,
      })

      if (newQuality.passed) {
        return { caption: newCaption, passed: true, method: 'gpt' }
      }
    } catch {
      // GPT also failed
    }
  }

  return null
}

function buildCorrectionPrompt(failureCodes: string[], failureMessages: string[], idea: any, profile: any, postPlan: any): string {
  const parts: string[] = []

  parts.push('The previous draft failed quality checks:')
  parts.push('')

  for (const code of failureCodes) {
    switch (code) {
      case 'UNSUPPORTED_PERSONAL_CLAIM':
        parts.push('- REMOVE all invented personal anecdotes, team stories, or client interactions.')
        parts.push('  Only use experiences explicitly confirmed in the Persona profile.')
        if (postPlan?.allowedPersonalClaims?.length > 0) {
          parts.push(`  Allowed claims: ${postPlan.allowedPersonalClaims.slice(0, 5).join(', ')}`)
        }
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
        if (postPlan?.coreInsight) {
          parts.push(`  Target insight: ${postPlan.coreInsight}`)
        }
        break
      case 'MALFORMED_SOURCE_HANDLING':
        parts.push('- FIX garbled or misspelled words. Do not build insights around malformed text.')
        break
      case 'WEAK_PERSONA_FIT':
        parts.push('- GROUND the post in the verified Persona expertise and experience.')
        if (postPlan?.whyThisPerson) {
          parts.push(`  Why this person: ${postPlan.whyThisPerson}`)
        }
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
  if (postPlan?.structure) {
    parts.push(`- Preferred structure: ${postPlan.structure}`)
  }

  return parts.join('\n')
}

function buildCorrectionSystemPrompt(profile: any, body: any, postPlan: any): string {
  const parts: string[] = []
  parts.push('You are a professional social media writer rewriting a post that failed quality checks.')
  parts.push('')
  if (profile) {
    if (profile.role) parts.push(`Person: ${profile.role} (${profile.seniority})`)
    if (profile.expertise?.length) {
      parts.push(`Verified expertise: ${profile.expertise.slice(0, 5).map((e: any) => `${e.area} (${e.level})`).join(', ')}`)
    }
    if (profile.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
  }
  if (postPlan) {
    if (postPlan.coreInsight) parts.push(`Core insight to preserve: ${postPlan.coreInsight}`)
    if (postPlan.audienceValue) parts.push(`Audience value: ${postPlan.audienceValue}`)
    if (postPlan.groundingMode) parts.push(`Grounding mode: ${postPlan.groundingMode}`)
    if (postPlan.allowedPersonalClaims?.length > 0) {
      parts.push(`ALLOWED personal claims:\n- ${postPlan.allowedPersonalClaims.join('\n- ')}`)
    }
    if (postPlan.forbiddenClaims?.length > 0) {
      parts.push(`FORBIDDEN:\n- ${postPlan.forbiddenClaims.join('\n- ')}`)
    }
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


