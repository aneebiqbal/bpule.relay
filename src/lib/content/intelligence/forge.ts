import type { ContentPlatform } from '@/lib/domain/types'
import { buildLongcatDraftChain, buildOpenaiDraftChain, pickDraftChain } from '@/lib/ai/routing'
import { structuredJsonChain } from '@/lib/ai/provider'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import { checkBannedPhrases, checkBadHook } from '@/lib/ai/content'

/**
 * Content Forge — multi-agent generation pipeline.
 *
 * Default path (quality + latency + cost):
 *   context assembly → genome → Writer A → Writer B →
 *   independent evaluation → winner → anti-slop → platform composition
 *
 * Reuses the proven BD best-of-two architecture.
 */

export interface ForgeInput {
  personaName: string
  platform: ContentPlatform
  sourceMaterial: string
  styleCard: string | null
  humorStyle: string
  valuesAndOpinions: string[]
  contentDnaBlock: string
  genomeBlock: string
  memoryBlock: string
  recentOpenings: string[]
  generationMode: 'personal' | 'opinion'
  performanceBlock?: string
  researchBlock?: string
}

export interface ForgeCandidate {
  caption: string
  hook: string
  writer: 'A' | 'B'
  selfCheckPassed: boolean
  selfCheckNote: string
  bannedHits: string[]
  badHook: boolean
  specificityHit: boolean
  humanizationPassed: boolean
  humanizationTells: string[]
}

export interface ForgeResult {
  caption: string
  hook: string
  winner: 'A' | 'B' | 'synthesis'
  candidateA: ForgeCandidate
  candidateB: ForgeCandidate
  evaluation: {
    quality: number
    distribution: number
    specificity: number
    slopScore: number
    notes: string[]
  }
  platform: ContentPlatform
}

/**
 * Run the full Content Forge pipeline.
 */
export async function runContentForge(input: ForgeInput): Promise<ForgeResult> {
  // Generate two independent candidates in parallel
  const [candidateA, candidateB] = await Promise.all([
    generateCandidate(input, 'A'),
    generateCandidate(input, 'B'),
  ])

  // Evaluate both
  const evalA = evaluateCandidate(candidateA, input)
  const evalB = evaluateCandidate(candidateB, input)

  // Pick winner
  const winner = evalA.totalScore >= evalB.totalScore ? 'A' : 'B'
  const winningCandidate = winner === 'A' ? candidateA : candidateB

  // Apply anti-slop
  const finalCaption = await applyAntiSlop(winningCandidate.caption, input)

  // Platform adaptation
  const platformCaption = adaptForPlatform(finalCaption, input.platform)

  return {
    caption: platformCaption,
    hook: extractHook(platformCaption),
    winner,
    candidateA,
    candidateB,
    evaluation: {
      quality: Math.round(Math.max(evalA.quality, evalB.quality) * 100) / 100,
      distribution: Math.round(Math.max(evalA.distribution, evalB.distribution) * 100) / 100,
      specificity: Math.round(Math.max(evalA.specificity, evalB.specificity) * 100) / 100,
      slopScore: Math.round(Math.min(evalA.slop, evalB.slop) * 100) / 100,
      notes: [...evalA.notes, ...evalB.notes],
    },
    platform: input.platform,
  }
}

async function generateCandidate(input: ForgeInput, writer: 'A' | 'B'): Promise<ForgeCandidate> {
  const chain = writer === 'A' ? buildLongcatDraftChain() : buildOpenaiDraftChain()
  const fallbackChain = pickDraftChain()
  const activeChain = chain.length > 0 ? chain : fallbackChain

  if (activeChain.length === 0) {
    return emptyCandidate(writer)
  }

  const writerPersona = writer === 'A'
    ? 'Write with a direct, personal voice. Lead with the specific detail. Keep sentences varied in length.'
    : 'Write with a slightly more reflective voice. Connect the specific to the universal. Use natural rhythm.'

  const result = await structuredJsonChain<{
    caption: string
    self_check_passed: boolean
    self_check_note: string
  }>(activeChain, {
    system: buildWriterSystemPrompt(input, writerPersona),
    user: buildWriterUserPrompt(input),
    schema: {
      type: 'object',
      required: ['caption', 'self_check_passed', 'self_check_note'],
      properties: {
        caption: { type: 'string', description: 'The full post caption' },
        self_check_passed: { type: 'boolean', description: 'Would this person actually post this?' },
        self_check_note: { type: 'string', description: 'Why this would or would not work' },
      },
    },
  })

  const caption = (result.data.caption ?? '').trim()
  const hook = extractHook(caption)

  // Run anti-generic checks
  const bannedHits = checkBannedPhrases(caption + '\n' + hook)
  const badHook = checkBadHook(hook)
  const specificityHit = checkSpecificity(hook + '\n' + caption, input.sourceMaterial)
  const fabricatedClaim = checkFabricatedPersonalClaim(caption, input.generationMode)

  // Humanization check
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
    && !fabricatedClaim
    && humanizationPassed

  let selfCheckNote = result.data.self_check_note
  if (bannedHits.length > 0) selfCheckNote = `Banned phrase(s): "${bannedHits.join('", "')}".`
  else if (badHook) selfCheckNote = 'Hook is too generic or rhetorical.'
  else if (!specificityHit) selfCheckNote = 'No concrete detail from source material.'
  else if (fabricatedClaim) selfCheckNote = 'Opinion mode cannot claim a specific personal event.'
  else if (!humanizationPassed) selfCheckNote = `Humanization tell(s): ${humanizationTells.join('; ')}.`

  return {
    caption: finalCaption,
    hook: extractHook(finalCaption),
    writer,
    selfCheckPassed,
    selfCheckNote,
    bannedHits,
    badHook,
    specificityHit,
    humanizationPassed,
    humanizationTells,
  }
}

function buildWriterSystemPrompt(input: ForgeInput, writerPersona: string): string {
  const parts = [
    `You write social media posts for ${input.personaName}.`,
    writerPersona,
    '',
    input.contentDnaBlock,
    input.genomeBlock,
    input.memoryBlock,
    input.performanceBlock,
    input.researchBlock,
    '',
    input.styleCard,
    input.humorStyle ? `Humor style: ${input.humorStyle}` : '',
    input.valuesAndOpinions.length > 0 ? `Real convictions: ${input.valuesAndOpinions.join(' | ')}` : '',
    '',
    `MODE: ${input.generationMode}`,
    '',
    'HARD RULES:',
    '1. NEVER use banned phrases: "unpopular opinion:", "here\'s the thing", "let that sink in", "thread 🧵", emoji as bullets.',
    '2. NEVER start with a rhetorical question as the hook.',
    '3. NEVER invent details. Everything must trace back to the source material.',
    '4. NEVER use clickbait ("stop scrolling", "read that again").',
    '5. NEVER use corporate jargon.',
    `6. If mode is opinion, do not claim a specific personal incident happened to ${input.personaName}.`,
    '7. The first 1-2 lines must contain a concrete, specific detail.',
    '8. Performance patterns are weak signals, not rules. Do not sacrifice authenticity for engagement.',
    '',
  ].filter(Boolean)

  return parts.join('\n')
}

function buildWriterUserPrompt(input: ForgeInput): string {
  return `REAL MATERIAL:
"""
${input.sourceMaterial}
"""

PLATFORM: ${input.platform}

Write a post. Output JSON: { "caption": "...", "self_check_passed": boolean, "self_check_note": "why this would/wouldn't work" }`
}

interface CandidateScore {
  quality: number
  distribution: number
  specificity: number
  slop: number
  totalScore: number
  notes: string[]
}

function evaluateCandidate(candidate: ForgeCandidate, input: ForgeInput): CandidateScore {
  const notes: string[] = []
  let quality = 0.5
  let distribution = 0.5
  let specificity = 0.5
  let slop = 0

  // Self-check bonus
  if (candidate.selfCheckPassed) {
    quality += 0.2
    notes.push('Self-check passed')
  } else {
    quality -= 0.15
    notes.push(`Self-check failed: ${candidate.selfCheckNote}`)
  }

  // Specificity
  if (candidate.specificityHit) {
    specificity += 0.3
    quality += 0.1
  } else {
    specificity -= 0.2
    quality -= 0.1
  }

  // Humanization
  if (candidate.humanizationPassed) {
    quality += 0.1
  } else {
    quality -= 0.1
    slop += 0.2
  }

  // Hook quality
  if (!candidate.badHook && candidate.hook.trim().length > 10) {
    distribution += 0.15
  }

  // Length appropriateness
  const len = candidate.caption.length
  if (input.platform === 'linkedin') {
    if (len > 200 && len < 2000) { distribution += 0.1 }
    if (len > 3000) { distribution -= 0.1 }
  } else {
    if (len > 50 && len < 1500) { distribution += 0.1 }
    if (len > 3000) { distribution -= 0.15 }
  }

  // Slop indicators
  const slopPatterns = [
    /\b(unpopular opinion|here's the thing|let that sink in|nobody talks about)\b/i,
    /\b(stop scrolling|read that again|thread 🧵)\b/i,
    /(\?\s*){2,}/,
    /(on the one hand.*on the other hand)/i,
  ]
  for (const pattern of slopPatterns) {
    if (pattern.test(candidate.caption)) slop += 0.15
  }

  quality = clamp01(quality)
  distribution = clamp01(distribution)
  specificity = clamp01(specificity)
  slop = clamp01(slop)

  const totalScore = quality * 0.4 + distribution * 0.2 + specificity * 0.3 - slop * 0.1

  return { quality, distribution, specificity, slop, totalScore, notes }
}

async function applyAntiSlop(caption: string, input: ForgeInput): Promise<string> {
  let result = caption

  // Remove excessive em dashes (AI tell)
  const emDashCount = (result.match(/—/g) || []).length
  if (emDashCount > 3) {
    result = result.replace(/—/g, (match, offset) => offset < result.length * 0.5 ? '—' : '-')
  }

  // Remove "Thoughts?" / "Agree?" / "Am I right?"
  result = result.replace(/\s*(Thoughts\?|Agree\?|Am I right\?|Who else\?)\s*$/gi, '')

  // Remove empty conclusions
  result = result.replace(/\s*(In conclusion|To summarize|The takeaway is)[^.!?]*[.!?]\s*$/gi, '')

  return result.trim()
}

function adaptForPlatform(caption: string, platform: ContentPlatform): string {
  if (platform === 'x') {
    return caption.trim()
  }
  return caption
}

function extractHook(caption: string): string {
  const lines = caption.split('\n').filter((l) => l.trim().length > 0)
  return lines.slice(0, 2).join('\n').trim()
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

function checkFabricatedPersonalClaim(caption: string, mode: 'personal' | 'opinion'): boolean {
  if (mode !== 'opinion') return false
  const text = caption.toLowerCase()
  const directEventClaims = [
    /\b(today|yesterday|last week|this morning)\b.{0,30}\b(i|we)\b/,
    /\b(i|we)\s+(spent|debugged|shipped|fixed|met|saw|handled|dealt|worked)\b/,
  ]
  return directEventClaims.some((re) => re.test(text))
}

function emptyCandidate(writer: 'A' | 'B'): ForgeCandidate {
  return {
    caption: '',
    hook: '',
    writer,
    selfCheckPassed: false,
    selfCheckNote: 'No model provider available.',
    bannedHits: [],
    badHook: false,
    specificityHit: false,
    humanizationPassed: false,
    humanizationTells: [],
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}
