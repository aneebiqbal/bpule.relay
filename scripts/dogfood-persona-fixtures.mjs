#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

import { generateDailyIdeas } from '../src/lib/content/daily-ideas.ts'
import { buildPostPlan, validateCoreInsight } from '../src/lib/content/post-plan.ts'
import { generateContent } from '../src/lib/ai/content.ts'
import { evaluatePostQuality } from '../src/lib/content/quality-gate.ts'
import { generateVisualConcept, isVisualConceptOriginal } from '../src/lib/writing/visual.ts'
import { pickDraftChain, buildLongcatDraftChain, buildOpenaiDraftChain } from '../src/lib/ai/routing.ts'

const ROOT = process.cwd()
const NOW = new Date().toISOString()

// Match app runtime behavior for local dogfooding runs.
loadDotenv({ path: path.join(ROOT, '.env.local') })

function readArrayLiteral(source, marker) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex === -1) throw new Error(`Could not find marker: ${marker}`)
  const start = source.indexOf('[', markerIndex)
  if (start === -1) throw new Error(`Could not find array start after: ${marker}`)

  let depth = 0
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  let escaped = false

  for (let i = start; i < source.length; i++) {
    const ch = source[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (inSingle) {
      if (ch === '\\') escaped = true
      else if (ch === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (ch === '\\') escaped = true
      else if (ch === '"') inDouble = false
      continue
    }
    if (inTemplate) {
      if (ch === '\\') escaped = true
      else if (ch === '`') inTemplate = false
      continue
    }

    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }
    if (ch === '`') {
      inTemplate = true
      continue
    }

    if (ch === '[') depth += 1
    if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, i + 1)
      }
    }
  }

  throw new Error(`Unclosed array for marker: ${marker}`)
}

function safeEvalArray(arrayLiteral) {
  // Controlled local script files only.
  return Function(`"use strict"; return (${arrayLiteral});`)()
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

function toProfile(persona, personaId) {
  const now = NOW
  return {
    id: `${personaId}-profile`,
    organizationId: 'dogfood-org',
    personaId,
    role: persona.role,
    seniority: persona.seniority || 'Senior',
    industries: persona.industries || [],
    audience: persona.audience || 'Professional audience',
    expertise: persona.expertise || [],
    technologies: persona.technologies || [],
    goals: persona.goals || [],
    topicsCared: persona.topicsCared || [],
    topicsAvoided: persona.topicsAvoided || [],
    opinions: persona.opinions || [],
    projects: persona.projects || [],
    experiences: persona.experiences || [],
    writingCharacteristics: persona.writingCharacteristics || {},
    storytellingTendencies: [],
    confidence: 0.85,
    lastLearnedAt: now,
    audiences: [persona.audience].filter(Boolean),
    territories: ['authority', 'proof', 'perspective', 'education', 'journey'],
    contentGoals: ['build_authority'],
    createdAt: now,
    updatedAt: now,
  }
}

function toClusters(persona, personaId) {
  const now = NOW
  return (persona.topicClusters || []).map((clusterName, i) => ({
    id: `${personaId}-cluster-${i + 1}`,
    organizationId: 'dogfood-org',
    personaId,
    clusterName,
    description: `Focus area: ${clusterName}`,
    sourceType: 'profile',
    mergedIntoId: null,
    lastInputAt: now,
    lastResearchAt: null,
    createdAt: now,
    updatedAt: now,
  }))
}

function toMemories(persona, personaId) {
  const now = NOW
  return (persona.memories || []).map((m, i) => ({
    id: `${personaId}-memory-${i + 1}`,
    organizationId: 'dogfood-org',
    personaId,
    memoryType: m.type,
    content: m.content,
    sourceDraftId: null,
    sourceHistoryId: null,
    createdAt: now,
  }))
}

function toHistory(persona, personaId) {
  const now = NOW
  return (persona.history || []).map((h, i) => ({
    id: `${personaId}-history-${i + 1}`,
    organizationId: 'dogfood-org',
    personaId,
    pillarId: null,
    topicClusterId: null,
    platform: 'linkedin',
    openingLine: h.line,
    postedAt: now,
    ledToRealOutcome: true,
    outcomeNotedAt: now,
    likes: h.likes ?? null,
    reach: h.reach ?? null,
    comments: h.comments ?? null,
    reposts: h.reposts ?? null,
    saves: h.saves ?? null,
    profileVisits: null,
    followerDelta: null,
    metricsLoggedAt: now,
  }))
}

function buildSourceMaterial(idea, profile) {
  const parts = []
  parts.push(`Topic: ${idea.title}`)
  parts.push(`Angle: ${idea.angle}`)
  if (idea.whyYou) parts.push(`Why this person: ${idea.whyYou}`)
  if (idea.whyAudience) parts.push(`Why audience cares: ${idea.whyAudience}`)
  if (profile?.role) parts.push(`Person role: ${profile.role}`)
  if (profile?.expertise?.length) {
    parts.push(`Expertise: ${profile.expertise.slice(0, 4).map((e) => e.area).join(', ')}`)
  }
  return parts.join('\n')
}

function buildStyleCard(profile, persona, postPlan) {
  const parts = []
  if (persona.humorStyle) parts.push(`Voice: ${persona.humorStyle}`)
  if (profile?.role) parts.push(`Writing as: ${profile.role}`)
  if (postPlan?.voice) parts.push(`Rhythm: ${postPlan.voice}`)
  if (postPlan?.structure) parts.push(`Structure: ${postPlan.structure}`)
  return parts.join('. ')
}

function buildDnaBlock(profile, postPlan) {
  const parts = []
  if (profile?.role) parts.push(`Role: ${profile.role} (${profile.seniority})`)
  if (profile?.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
  if (profile?.expertise?.length) {
    parts.push(`Verified expertise: ${profile.expertise.slice(0, 5).map((e) => `${e.area} (${e.level})`).join(', ')}`)
  }
  if (postPlan?.coreInsight) parts.push(`Core insight: ${postPlan.coreInsight}`)
  if (postPlan?.groundingMode) parts.push(`Grounding: ${postPlan.groundingMode}`)
  return parts.join('\n')
}

function includesAny(text, keywords) {
  const lower = String(text || '').toLowerCase()
  return keywords.some((k) => lower.includes(String(k).toLowerCase()))
}

function assessOpportunity(pick, profile) {
  if (!pick) {
    return { rating: 'BAD', score: 0, reason: 'No idea produced for Content for Today.' }
  }

  let score = 0
  if (pick.confidence >= 0.75) score += 2
  else if (pick.confidence >= 0.6) score += 1

  const expertiseTerms = (profile.expertise || []).map((e) => e.area)
  const relevanceText = `${pick.title}\n${pick.angle}\n${pick.whyYou}`
  if (includesAny(relevanceText, expertiseTerms)) score += 2

  if ((pick.whyAudience || '').length > 40) score += 1
  if (['authority', 'proof', 'perspective', 'education', 'journey'].includes(pick.territory)) score += 1

  if (score >= 5) return { rating: 'GOOD', score, reason: 'Specific and persona-aligned opportunity.' }
  if (score >= 3) return { rating: 'LIGHT_EDIT', score, reason: 'Usable idea but not strongly differentiated.' }
  return { rating: 'BAD', score, reason: 'Low confidence or weak persona alignment.' }
}

function evaluateVisualQuality(visualIdea, imagePrompt) {
  if (!visualIdea || !imagePrompt) {
    return { rating: 'BAD', reasons: ['Visual package missing from finished draft.'] }
  }
  const reasons = []
  if (visualIdea.length < 20) reasons.push('Visual idea is too short to guide execution.')
  if (!isVisualConceptOriginal(imagePrompt)) reasons.push('Prompt falls into overused visual patterns.')
  if (reasons.length === 0) return { rating: 'GOOD', reasons: ['Visual concept is specific and non-generic.'] }
  if (reasons.length === 1) return { rating: 'LIGHT_EDIT', reasons }
  return { rating: 'BAD', reasons }
}

function evaluateImagePromptQuality(imagePrompt) {
  if (!imagePrompt) {
    return { rating: 'BAD', reasons: ['No image prompt generated.'] }
  }
  const reasons = []
  if (!imagePrompt.includes('1.91:1') && !imagePrompt.includes('16:9')) {
    reasons.push('Missing explicit platform composition ratio.')
  }
  const lower = imagePrompt.toLowerCase()
  if (!lower.includes('no robots') || !lower.includes('no stock photos')) {
    reasons.push('Missing anti-generic constraints in prompt wording.')
  }
  if (!isVisualConceptOriginal(imagePrompt)) {
    reasons.push('Prompt includes overused imagery cues.')
  }
  if (reasons.length === 0) {
    return { rating: 'GOOD', reasons: ['Platform-aware and constrained prompt with original framing.'] }
  }
  if (reasons.length === 1) return { rating: 'LIGHT_EDIT', reasons }
  return { rating: 'BAD', reasons }
}

function classifyPost(quality) {
  const failureCodes = quality.failures.map((f) => f.code)
  const unsafeCodes = new Set(['UNSUPPORTED_PERSONAL_CLAIM', 'MALFORMED_SOURCE_HANDLING'])
  if (failureCodes.some((code) => unsafeCodes.has(code))) {
    return { rating: 'UNSAFE', reasons: failureCodes }
  }
  if (!quality.passed) {
    return { rating: 'BAD', reasons: failureCodes.length ? failureCodes : ['QUALITY_GATE_FAILED'] }
  }
  if (quality.warnings.length > 0) {
    return { rating: 'LIGHT_EDIT', reasons: quality.warnings.map((w) => w.code) }
  }
  return { rating: 'GOOD', reasons: ['QUALITY_GATE_PASS'] }
}

function classifyBlockedProvider(message) {
  const msg = String(message || '').toLowerCase()
  return (
    msg.includes('no ai provider configured') ||
    msg.includes('no provider host is configured') ||
    msg.includes('every configured host failed')
  )
}

async function runPersonaFlow(persona, index, providerState) {
  const personaId = `seed-${firstName(persona.displayName).toLowerCase()}-${index}`
  const profile = toProfile(persona, personaId)
  const clusters = toClusters(persona, personaId)
  const memories = toMemories(persona, personaId)
  const history = toHistory(persona, personaId)
  const journey = []

  const ideas = generateDailyIdeas({
    profile,
    clusters,
    history,
    memories,
    journey,
    contentGoals: profile.contentGoals || [],
    audiences: profile.audiences || [],
    territories: profile.territories || [],
  })

  const pick = ideas[0] || null
  const opportunity = assessOpportunity(pick, profile)

  if (!pick) {
    return {
      persona: persona.displayName,
      opportunityQuality: opportunity.rating,
      postRating: 'BAD',
      visualQuality: 'BAD',
      imagePromptQuality: 'BAD',
      providerPath: 'none',
      ideaTitle: null,
      captionPreview: null,
      reasons: [opportunity.reason],
    }
  }

  const postPlan = buildPostPlan({
    idea: pick,
    profile,
    journey,
    platform: 'linkedin',
  })

  const insightCheck = validateCoreInsight(postPlan.coreInsight)
  if (!insightCheck.valid) {
    return {
      persona: persona.displayName,
      opportunityQuality: opportunity.rating,
      postRating: 'BAD',
      visualQuality: 'BAD',
      imagePromptQuality: 'BAD',
      providerPath: 'none',
      ideaTitle: pick.title,
      captionPreview: null,
      reasons: [`Core insight rejected before draft generation: ${insightCheck.reason}`],
    }
  }

  if (providerState.pickDraftChain === 0) {
    return {
      persona: persona.displayName,
      opportunityQuality: opportunity.rating,
      postRating: 'BLOCKED_PROVIDER',
      visualQuality: 'BLOCKED_PROVIDER',
      imagePromptQuality: 'BLOCKED_PROVIDER',
      providerPath: 'none',
      ideaTitle: pick.title,
      captionPreview: null,
      reasons: ['No provider chain available for Write this.'],
    }
  }

  const sourceMaterial = buildSourceMaterial(pick, profile)
  const hostAttempts = []
  let caption = ''

  try {
    const generated = await generateContent(
      {
        personaName: persona.displayName,
        topic: { id: pick.id, name: pick.title, description: pick.angle },
        sourceMaterial,
        platform: 'linkedin',
        styleCard: buildStyleCard(profile, persona, postPlan),
        recentOpenings: memories.filter((m) => m.memoryType === 'hook_used').map((m) => m.content),
        humorStyle: persona.humorStyle || undefined,
        valuesAndOpinions: (profile.opinions || []).map((o) => o.belief),
        generationMode: 'personal',
        contentDnaBlock: buildDnaBlock(profile, postPlan),
        postPlan,
      },
      undefined,
      (entry) => {
        hostAttempts.push(entry)
      },
    )
    caption = generated.caption.trim()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error'
    const blocked = classifyBlockedProvider(message)
    return {
      persona: persona.displayName,
      opportunityQuality: opportunity.rating,
      postRating: blocked ? 'BLOCKED_PROVIDER' : 'BAD',
      visualQuality: blocked ? 'BLOCKED_PROVIDER' : 'BAD',
      imagePromptQuality: blocked ? 'BLOCKED_PROVIDER' : 'BAD',
      providerPath: hostAttempts.map((a) => `${a.host}:${a.success ? 'ok' : a.failureReason || 'fail'}`).join(' -> ') || 'none',
      ideaTitle: pick.title,
      captionPreview: null,
      reasons: [`Write this failed: ${message}`],
    }
  }

  if (!caption || caption.length < 20) {
    return {
      persona: persona.displayName,
      opportunityQuality: opportunity.rating,
      postRating: 'BAD',
      visualQuality: 'BAD',
      imagePromptQuality: 'BAD',
      providerPath: hostAttempts.map((a) => `${a.host}:${a.success ? 'ok' : a.failureReason || 'fail'}`).join(' -> ') || 'none',
      ideaTitle: pick.title,
      captionPreview: caption || null,
      reasons: ['Finished Post is too short for quality checks.'],
    }
  }

  const quality = evaluatePostQuality({
    caption,
    personaContext: {
      expertise: profile.expertise.map((e) => e.area),
      audiences: profile.audiences || [],
      goals: profile.contentGoals || [],
      projects: profile.projects.map((p) => p.name),
      opinions: profile.opinions.map((o) => o.belief),
      territories: profile.territories || [],
      role: profile.role,
    },
    sourceMaterial,
    platform: 'linkedin',
  })
  const postRating = classifyPost(quality)

  const visual = generateVisualConcept({
    postText: caption,
    platform: 'linkedin',
    angle: pick.angle,
    topic: pick.title,
    coreDetail: pick.angle.slice(0, 100),
    tone: 'confident',
  })

  const visualQuality = evaluateVisualQuality(visual.visualIdea, visual.imagePrompt)
  const promptQuality = evaluateImagePromptQuality(visual.imagePrompt)

  const reasons = [
    `Opportunity: ${opportunity.reason}`,
    `Post: ${postRating.reasons.join(', ')}`,
    `Visual: ${visualQuality.reasons.join(', ')}`,
    `Prompt: ${promptQuality.reasons.join(', ')}`,
  ]

  return {
    persona: persona.displayName,
    opportunityQuality: opportunity.rating,
    postRating: postRating.rating,
    visualQuality: visualQuality.rating,
    imagePromptQuality: promptQuality.rating,
    providerPath: hostAttempts.map((a) => `${a.host}:${a.success ? 'ok' : a.failureReason || 'fail'}`).join(' -> ') || 'none',
    ideaTitle: pick.title,
    captionPreview: caption.slice(0, 220),
    reasons,
    fullCaption: caption,
    visualIdea: visual.visualIdea,
    imagePrompt: visual.imagePrompt,
  }
}

async function main() {
  const benchmarkPath = path.join(ROOT, 'scripts/benchmark-studio.mjs')
  const seedPath = path.join(ROOT, 'scripts/seed-studio-personas.mjs')

  const [benchmarkText, seedText] = await Promise.all([
    fs.readFile(benchmarkPath, 'utf8'),
    fs.readFile(seedPath, 'utf8'),
  ])

  const benchmarkPersonas = safeEvalArray(readArrayLiteral(benchmarkText, 'const PERSONAS = ['))
  const seededPersonas = safeEvalArray(readArrayLiteral(seedText, 'const PERSONAS = ['))
  const benchmarkNames = new Set(benchmarkPersonas.map((p) => p.name))
  const fixtures = seededPersonas.filter((p) => benchmarkNames.has(firstName(p.displayName)))

  const providerState = {
    pickDraftChain: pickDraftChain().length,
    longcatDraftChain: buildLongcatDraftChain().length,
    openaiDraftChain: buildOpenaiDraftChain().length,
    chainOrder: pickDraftChain().map((step) => `${step.host.id}:${step.host.model}`),
  }

  const rows = []
  for (let i = 0; i < fixtures.length; i++) {
    rows.push(await runPersonaFlow(fixtures[i], i + 1, providerState))
  }

  const summary = {
    total: rows.length,
    good: rows.filter((r) => r.postRating === 'GOOD').length,
    lightEdit: rows.filter((r) => r.postRating === 'LIGHT_EDIT').length,
    bad: rows.filter((r) => r.postRating === 'BAD').length,
    unsafe: rows.filter((r) => r.postRating === 'UNSAFE').length,
    blockedProvider: rows.filter((r) => r.postRating === 'BLOCKED_PROVIDER').length,
  }

  const payload = {
    generatedAt: NOW,
    fixtureSource: {
      benchmarkFixtureCount: benchmarkPersonas.length,
      seededFixtureCount: seededPersonas.length,
      runCount: fixtures.length,
      runPolicy: 'real_seeded_only_no_synthetic',
      runNames: fixtures.map((f) => f.displayName),
      skippedBenchmarkNames: benchmarkPersonas
        .map((p) => p.name)
        .filter((name) => !fixtures.some((f) => firstName(f.displayName) === name)),
    },
    providerState,
    summary,
    rows,
  }

  const outDir = path.join(ROOT, 'benchmark-results')
  const outFile = path.join(outDir, `dogfood-persona-fixtures-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8')

  console.log(JSON.stringify({ outFile, ...payload }, null, 2))
}

main().catch((error) => {
  console.error('[dogfood-persona-fixtures] failed', error)
  process.exit(1)
})
