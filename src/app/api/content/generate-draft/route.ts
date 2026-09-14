import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'
import { generateContent } from '@/lib/ai/content'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import { checkBannedPhrases, checkBadHook } from '@/lib/ai/content'
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

  // Quality gate
  const bannedHits = checkBannedPhrases(caption)
  const badHook = checkBadHook(caption.split('\n')[0] ?? '')
  const humanization = checkHumanization(caption)
  const qualityPassed = bannedHits.length === 0 && !badHook && humanization.passed

  // Generate visual concept
  const visual = generateVisualIdea(caption, body.idea, platform as string)

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
      specificityHit: !badHook,
      status: qualityPassed ? 'ready' : 'draft',
    })
  } catch (err) {
    console.error('[generate-draft] persistence failed:', err)
    // Return generated content so user doesn't lose it
    return NextResponse.json({
      error: 'Could not save draft. Your content is preserved below.',
      caption,
      visualIdea: visual.idea,
      imagePrompt: visual.imagePrompt,
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
    visualIdea: visual.idea,
    imagePrompt: visual.imagePrompt,
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

function generateVisualIdea(caption: string, idea: GenerateBody['idea'], platform: string): { idea: string; imagePrompt: string } {
  const firstLine = caption.split('\n')[0] ?? caption.slice(0, 60)
  const territory = idea.territory ?? 'professional'

  let idea_text = ''
  let imagePrompt = ''

  // Choose visual strategy based on territory
  if (territory === 'authority' || territory === 'education') {
    idea_text = `Editorial illustration: ${firstLine.slice(0, 40)}`
    imagePrompt = `Editorial illustration for a ${platform} post. Subject: ${firstLine.slice(0, 50)}. ` +
      `Style: clean, modern, professional. Composition: centered subject with subtle geometric background. ` +
      `Mood: confident, informative. Colors: muted blues and whites. No text overlay. ` +
      `Aspect ratio: ${platform === 'instagram' ? '1:1' : '16:9'}.`
  } else if (territory === 'journey' || territory === 'proof') {
    idea_text = `Behind-the-scenes: real moment from experience`
    imagePrompt = `Cinematic photograph style. Subject: ${firstLine.slice(0, 50)}. ` +
      `Style: authentic, slightly desaturated, natural lighting. Composition: rule of thirds, environmental context. ` +
      `Mood: reflective, honest. Aspect ratio: ${platform === 'instagram' ? '4:5' : '16:9'}.`
  } else if (territory === 'perspective' || territory === 'conversation') {
    idea_text = `Conceptual: ${firstLine.slice(0, 30)}`
    imagePrompt = `Conceptual digital art. Visual metaphor for: ${firstLine.slice(0, 50)}. ` +
      `Style: minimal, bold, symbolic. Composition: single striking element on clean background. ` +
      `Mood: thought-provoking. Colors: monochrome with one accent color. ` +
      `Aspect ratio: ${platform === 'instagram' ? '1:1' : '16:9'}.`
  } else {
    idea_text = `Minimal typography: "${firstLine.slice(0, 20)}"`
    imagePrompt = `Minimal typography composition. Text: "${firstLine.slice(0, 30)}". ` +
      `Style: bold serif font on solid background. Composition: centered, generous whitespace. ` +
      `Mood: ${territory === 'human' ? 'warm, personal' : 'confident, direct'}. ` +
      `Colors: black text on white or cream background. ` +
      `Aspect ratio: ${platform === 'instagram' ? '1:1' : '16:9'}.`
  }

  return { idea: idea_text, imagePrompt }
}
