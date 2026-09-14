import { pickDraftChain } from '@/lib/ai/routing'
import { structuredJsonChain } from '@/lib/ai/provider'

import type { ContentPlatform } from '@/lib/domain/types'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import { stripEmDashes } from '@/lib/facts/sanitize'

/**
 * Content generation pipeline.
 *
 * Design: real material in, shaped draft out. The system never invents a post —
 * it sharpens something the person actually observed. Anti-generic checks are
 * structural (rejected and regenerated on match), not prompt suggestions.
 */

// ── Banned phrases ──────────────────────────────────────────────────────────
// The actual tells of generic AI-written content. Reject on match.
const BANNED_PHRASES = [
  'unpopular opinion:',
  'here\'s the thing',
  'let that sink in',
  'here\'s why',
  'thread 🧵',
  'thread 🧵👇',
  '👇',
  '💡',
  'let me tell you',
  'the truth is',
  'nobody talks about this',
  'i wish i knew this sooner',
  'stop scrolling',
  'read that again',
]

const BANNED_HOOK_PATTERNS = [
  /^(are|is|do|does|can|could|would|will|have|has|did)\s.+\?$/i,
  /^(unpopular\s+opinion|the\s+truth\s+about|nobody\s+talks\s+about)/i,
]

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContentGenerationInput {
  personaName: string
  topic: {
    id: string
    name: string
    description?: string
  }
  sourceMaterial: string
  platform: ContentPlatform
  styleCard: string | null
  recentOpenings: string[]
  humorStyle?: string
  valuesAndOpinions?: string[]
  generationMode?: 'personal' | 'opinion'
  trendingAngle?: string | null
  preferenceHints?: string[]
  /** A curated post shape used as scaffolding only — never a claim about how the post will perform. */
  structure?: { structureName: string; shape: string } | null
  /** Assembled Content DNA block — persona expertise, experience, convictions. */
  contentDnaBlock?: string | null
}

export interface ContentGenerationResult {
  caption: string
  hook: string
  hookScore: number
  hookFeedback: string
  selfCheckPassed: boolean
  selfCheckNote: string
  bannedHits: string[]
  specificityHit: boolean
  humanizationTells: string[]
  humanizationPassed: boolean
}

interface ModelContentOutput {
  caption: string
  hook_score: number
  hook_feedback: string
  self_check_passed: boolean
  self_check_note: string
}

// ── Pipeline ────────────────────────────────────────────────────────────────

export async function generateContent(
  input: ContentGenerationInput,
  onStatus?: (msg: string) => void,
  onHostAttempt?: (log: { host: string; model: string; costTier: 'tier1' | 'tier2' | 'tier3' | 'tier4'; success: boolean; failureReason: 'rate_limit' | 'insufficient_balance' | 'timeout' | 'auth' | 'other' | null; errorMessage: string; latencyMs: number }) => void | Promise<void>,
): Promise<ContentGenerationResult> {
  const chain = pickDraftChain()
  if (chain.length === 0) {
    throw new Error('No AI provider configured. Set GROQ_API_KEY to generate content.')
  }

  onStatus?.('Drafting in this persona\'s voice...')

  const result = await structuredJsonChain<ModelContentOutput>(chain, {
    system: buildContentSystemPrompt(input),
    user: buildContentUserPrompt(input),
    schema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The full post caption' },
        hook_score: { type: 'integer', description: 'Hook quality 1-10' },
        hook_feedback: { type: 'string', description: 'One-line reason for the score' },
        self_check_passed: { type: 'boolean', description: 'Whether this persona would actually post this' },
        self_check_note: { type: 'string', description: 'Why this would or would not work' },
      },
      required: ['caption', 'hook_score', 'hook_feedback', 'self_check_passed', 'self_check_note'],
    },
    onStatus,
  }, onHostAttempt)

  const caption = result.data.caption.trim()
  const hook = extractHook(caption)

  // ── Anti-generic checks ──────────────────────────────────────────────
  const bannedHits = checkBannedPhrases(caption + '\n' + hook)
  const badHook = checkBadHook(hook)
  const specificityHit = checkSpecificity(hook + '\n' + caption, input.sourceMaterial)
  const repeats = checkRepetition(hook, input.recentOpenings)
  const fabricatedPersonalClaim = checkFabricatedPersonalClaim(caption, input.generationMode ?? 'personal')

  // ── Humanization check (rhythm, hedging, listiness, transitions) ────
  let humanizationTells: string[] = []
  let humanizationPassed = true
  let finalCaption = caption
  const humanization = checkHumanization(caption)
  if (!humanization.passed) {
    humanizationTells = humanization.flaggedTells
    humanizationPassed = false
    const rewritten = rewriteToHumanize(caption, humanization.flaggedTells)
    if (rewritten !== caption) {
      finalCaption = rewritten
    }
  }

  const selfCheckPassed = result.data.self_check_passed
    && bannedHits.length === 0
    && !badHook
    && specificityHit
    && !repeats
    && !fabricatedPersonalClaim
    && humanizationPassed
  let selfCheckNote = result.data.self_check_note

  if (bannedHits.length > 0) {
    selfCheckNote = `Banned phrase(s): "${bannedHits.join('", "')}".`
  } else if (badHook) {
    selfCheckNote = 'Hook is too generic or rhetorical.'
  } else if (!specificityHit) {
    selfCheckNote = 'No concrete detail from today\'s material.'
  } else if (repeats) {
    selfCheckNote = 'Too similar to a recent opening line.'
  } else if (fabricatedPersonalClaim) {
    selfCheckNote = 'Opinion mode cannot claim a specific personal event.'
  } else if (!humanizationPassed) {
    selfCheckNote = `Humanization tell(s): ${humanizationTells.join('; ')}.`
  }

  onStatus?.('Done')

  return { caption: finalCaption, hook: extractHook(finalCaption), hookScore: result.data.hook_score, hookFeedback: result.data.hook_feedback, selfCheckPassed, selfCheckNote, bannedHits, specificityHit, humanizationTells, humanizationPassed }
}

// ── Prompts ────────────────────────────────────────────────────────────────

function buildContentSystemPrompt(input: ContentGenerationInput): string {
  const styleBlock = input.styleCard ?? ''
  const personalityBlock = [
    input.humorStyle ? `Humor style: ${input.humorStyle}` : '',
    input.valuesAndOpinions && input.valuesAndOpinions.length > 0
      ? `Real convictions: ${input.valuesAndOpinions.join(' | ')}`
      : '',
  ].filter(Boolean).join('\n')
  const preferenceBlock = input.preferenceHints && input.preferenceHints.length > 0
    ? `What this person tends to keep:\n- ${input.preferenceHints.join('\n- ')}`
    : ''
  const mode = input.generationMode ?? 'personal'
  const structureBlock = input.structure
    ? `SUGGESTED SHAPE (scaffolding only, not a rule you must force — drop it if the real material doesn't fit): ${input.structure.structureName}. ${input.structure.shape}`
    : ''
  const dnaBlock = input.contentDnaBlock ?? ''

  return `You write social media posts for ${input.personaName}. Your job is to turn their real observation into a post that sounds like them, not like a generic content engine.

${dnaBlock}
${styleBlock}
${personalityBlock}
${preferenceBlock}
${structureBlock}

HARD RULES:
1. NEVER use banned phrases: "unpopular opinion:", "here's the thing", "let that sink in", "thread 🧵", emoji as bullets.
2. NEVER start with a rhetorical question as the hook.
3. NEVER invent details. Everything must trace back to the source material.
4. NEVER use clickbait ("stop scrolling", "read that again").
5. NEVER use corporate jargon.
6. If mode is opinion, do not claim a specific personal incident happened to ${input.personaName}.
7. The suggested shape above, if given, is structural scaffolding only. Never let it override rule 3 — do not invent a moment, a number, or a quote just to fit the shape.

MODE: ${mode}

PLATFORM GUIDANCE:
${getPlatformGuidance(input.platform)}

HOOK - the first 1-2 lines must contain a concrete, specific detail from the source material. Score it honestly 1-10.`
}

function buildContentUserPrompt(input: ContentGenerationInput): string {
  const mode = input.generationMode ?? 'personal'
  return `TOPIC CLUSTER: ${input.topic.name}
${input.topic.description ? `(${input.topic.description})` : ''}

PLATFORM: ${input.platform}

MODE: ${mode}
${input.trendingAngle ? `TRENDING ANGLE: ${input.trendingAngle}` : ''}

REAL MATERIAL FROM TODAY:
"""
${input.sourceMaterial}
"""

Write a post. Output JSON: { "caption": "...", "hook_score": 1-10, "hook_feedback": "one-line reason for the score", "self_check_passed": boolean, "self_check_note": "why this would/wouldn't work" }`
}

function getPlatformGuidance(platform: string): string {
  switch (platform) {
    case 'x':
      return 'X/Twitter: Write tight, native observations. One clear insight. No threads unless justified. Under 280 chars. Lead with the strongest point.'
    case 'instagram':
      return 'Instagram: Visual-first thinking. Caption should complement an image. Shorter paragraphs. More personal tone. Relevant hashtags ok.'
    case 'linkedin':
    default:
      return 'LinkedIn: Professional insight format. Can be longer-form. Lead with a specific observation or contrarian take. Include mechanism or tradeoff. End naturally without forced inspiration.'
  }
}

// ── Checks ──────────────────────────────────────────────────────────────────

function extractHook(caption: string): string {
  const lines = caption.split('\n').filter((l) => l.trim().length > 0)
  return lines.slice(0, 2).join('\n').trim()
}

export function checkBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase()
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()))
}

export function checkBadHook(hook: string): boolean {
  return BANNED_HOOK_PATTERNS.some((re) => re.test(hook.trim()))
}

function checkSpecificity(text: string, sourceMaterial: string): boolean {
  const sourceWords = sourceMaterial
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)

  const textLower = text.toLowerCase()
  let matchCount = 0
  for (const word of sourceWords) {
    if (textLower.includes(word)) {
      matchCount++
      if (matchCount >= 2) return true
    }
  }
  return false
}

function checkRepetition(hook: string, recentOpenings: string[]): boolean {
  const hookLower = hook.toLowerCase().trim()
  if (!hookLower || recentOpenings.length === 0) return false
  return recentOpenings.some((opening) => {
    const openingLower = opening.toLowerCase().trim()
    if (!openingLower) return false
    if (hookLower === openingLower) return true
    if (hookLower.slice(0, 30) === openingLower.slice(0, 30)) return true
    return false
  })
}

function checkFabricatedPersonalClaim(caption: string, mode: 'personal' | 'opinion'): boolean {
  if (mode !== 'opinion') return false
  const text = caption.toLowerCase()
  const directEventClaims = [
    /\b(today|yesterday|last week|this morning)\b.{0,30}\b(i|we)\b/,
    /\b(i|we)\s+(spent|debugged|shipped|fixed|met|saw|handled|dealt|worked)\b/,
  ]
  return directEventClaims.some((re) => re.test(text))
}
