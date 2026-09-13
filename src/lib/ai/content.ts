import { pickDraftChain } from '@/lib/ai/routing'
import { structuredJsonChain } from '@/lib/ai/provider'

import type { ContentPlatform } from '@/lib/domain/types'

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
  })

  const caption = result.data.caption.trim()
  const hook = extractHook(caption)

  // ── Anti-generic checks ──────────────────────────────────────────────
  const bannedHits = checkBannedPhrases(caption + '\n' + hook)
  const badHook = checkBadHook(hook)
  const specificityHit = checkSpecificity(hook + '\n' + caption, input.sourceMaterial)
  const repeats = checkRepetition(hook, input.recentOpenings)
  const fabricatedPersonalClaim = checkFabricatedPersonalClaim(caption, input.generationMode ?? 'personal')

  const selfCheckPassed = result.data.self_check_passed
    && bannedHits.length === 0
    && !badHook
    && specificityHit
    && !repeats
    && !fabricatedPersonalClaim
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
  }

  onStatus?.('Done')

  return { caption, hook, hookScore: result.data.hook_score, hookFeedback: result.data.hook_feedback, selfCheckPassed, selfCheckNote, bannedHits, specificityHit }
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
  const mode = input.generationMode ?? 'personal'

  return `You write social media posts for ${input.personaName}. Your job is to turn their real observation into a post that sounds like them, not like a generic content engine.

${styleBlock}
${personalityBlock}

HARD RULES:
1. NEVER use banned phrases: "unpopular opinion:", "here's the thing", "let that sink in", "thread 🧵", emoji as bullets.
2. NEVER start with a rhetorical question as the hook.
3. NEVER invent details. Everything must trace back to the source material.
4. NEVER use clickbait ("stop scrolling", "read that again").
5. NEVER use corporate jargon.
6. If mode is opinion, do not claim a specific personal incident happened to ${input.personaName}.

MODE: ${mode}

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

// ── Checks ──────────────────────────────────────────────────────────────────

function extractHook(caption: string): string {
  const lines = caption.split('\n').filter((l) => l.trim().length > 0)
  return lines.slice(0, 2).join('\n').trim()
}

function checkBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase()
  return BANNED_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()))
}

function checkBadHook(hook: string): boolean {
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
