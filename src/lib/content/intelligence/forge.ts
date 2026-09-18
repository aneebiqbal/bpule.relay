import type { ContentPlatform } from '@/lib/domain/types'
import { shouldEscalateToPremium } from '@/lib/ai/routing'
import { generate } from '@/lib/ai/runtime'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import { checkBannedPhrases, checkBadHook } from '@/lib/ai/content'
import {
  buildAntiSlopBlock,
  buildOriginalityBlock,
  type ContentStructure,
  selectStructure,
  structureToPrompt,
} from '@/lib/writing/engine'
import { generateVisualConcept } from '@/lib/writing/visual'

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
  recentStructures?: ContentStructure[]
  generationMode: 'personal' | 'opinion'
  performanceBlock?: string
  researchBlock?: string
  interviewAnswers?: string[]
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
  structure: import('@/lib/writing/engine').ContentStructure
  visualConcept?: import('@/lib/writing/visual').VisualConcept
}

/**
 * Run the full Content Forge pipeline with conditional single-generation.
 *
 * LongCat first → quality gates → PASS: return.
 * FAIL: second candidate → GPT escalation only if needed.
 */
export async function runContentForge(input: ForgeInput): Promise<ForgeResult> {
  const structureSelection = selectStructure(
    input.sourceMaterial,
    input.recentStructures ?? [],
    input.generationMode,
  )

  // Attempt 1: LongCat candidate
  const candidateA = await generateCandidate(input, 'A', structureSelection)
  const evalA = evaluateCandidate(candidateA, input)
  const aPassed = candidateA.selfCheckPassed && candidateA.specificityHit && candidateA.humanizationPassed && candidateA.bannedHits.length === 0 && !candidateA.badHook

  if (aPassed) {
    return buildForgeResult(input, candidateA, null, evalA, null, structureSelection, 'A')
  }

  // Attempt 2: Groq strong retry with different persona
  const escalation = shouldEscalateToPremium({
    primaryPassed: aPassed,
    primaryScore: evalA.totalScore,
    isHighValue: false,
    malformedOutput: false,
    attemptCount: 1,
  })

  const candidateB = await generateCandidate(input, 'B', structureSelection)
  const evalB = evaluateCandidate(candidateB, input)
  const bPassed = candidateB.selfCheckPassed && candidateB.specificityHit && candidateB.humanizationPassed && candidateB.bannedHits.length === 0 && !candidateB.badHook

  if (bPassed) {
    return buildForgeResult(input, candidateB, candidateA, evalB, evalA, structureSelection, 'B', escalation.reason)
  }

  // Attempt 3: Runtime handles escalation automatically
  let candidateC: ForgeCandidate | null = null
  let evalC: ReturnType<typeof evaluateCandidate> | null = null
  if (escalation.shouldEscalate) {
    candidateC = await generateCandidate(input, 'B', structureSelection)
    if (candidateC) {
      evalC = evaluateCandidate(candidateC, input)
    }
  }

  // Pick best by total score
  const candidates: Array<{ c: ForgeCandidate; e: ReturnType<typeof evaluateCandidate>; label: 'A' | 'B' | 'C' }> = [
    { c: candidateA, e: evalA, label: 'A' },
    { c: candidateB, e: evalB, label: 'B' },
  ]
  if (candidateC && evalC) {
    candidates.push({ c: candidateC, e: evalC, label: 'C' })
  }
  candidates.sort((x, y) => y.e.totalScore - x.e.totalScore)
  const winner = candidates[0]

  const runnerUp = candidates[1] ?? null
  const runnerUpEval = runnerUp?.e ?? null

  return buildForgeResult(
    input,
    winner.c,
    runnerUp?.c ?? null,
    winner.e,
    runnerUpEval,
    structureSelection,
    winner.label === 'C' ? 'synthesis' : winner.label,
    escalation.reason,
  )
}

async function buildForgeResult(
  input: ForgeInput,
  winning: ForgeCandidate,
  other: ForgeCandidate | null,
  winningEval: ReturnType<typeof evaluateCandidate>,
  otherEval: ReturnType<typeof evaluateCandidate> | null,
  structureSelection: { structure: ContentStructure; reason: string },
  winner: 'A' | 'B' | 'synthesis',
  escalationReason?: string,
): Promise<ForgeResult> {
  const finalCaption = await applyAntiSlop(winning.caption)
  const platformCaption = adaptForPlatform(finalCaption, input.platform)

  const visualConcept = generateVisualConcept({
    postText: platformCaption,
    platform: input.platform as 'linkedin' | 'x',
    angle: input.genomeBlock.slice(0, 100),
    topic: input.genomeBlock.split('\n')[0] ?? '',
    styleCard: input.styleCard,
    coreDetail: extractCoreDetail(platformCaption, input.sourceMaterial),
    tone: input.generationMode === 'personal' ? 'serious' : 'thoughtful',
  })

  const candidateA = winner === 'A' ? winning : (other?.writer === 'A' ? other : winning)
  const candidateB = winner === 'B' || winner === 'synthesis' ? winning : (other?.writer === 'B' ? other : winning)

  return {
    caption: platformCaption,
    hook: extractHook(platformCaption),
    winner,
    candidateA,
    candidateB,
    evaluation: {
      quality: Math.round(Math.max(winningEval.quality, otherEval?.quality ?? 0) * 100) / 100,
      distribution: Math.round(Math.max(winningEval.distribution, otherEval?.distribution ?? 0) * 100) / 100,
      specificity: Math.round(Math.max(winningEval.specificity, otherEval?.specificity ?? 0) * 100) / 100,
      slopScore: Math.round(Math.min(winningEval.slop, otherEval?.slop ?? 1) * 100) / 100,
      notes: [...winningEval.notes, ...(otherEval?.notes ?? [])],
    },
    platform: input.platform,
    structure: structureSelection.structure,
    visualConcept,
  }
}

async function generateCandidate(
  input: ForgeInput,
  writer: 'A' | 'B',
  structureSelection: { structure: ContentStructure; reason: string } | undefined,
): Promise<ForgeCandidate> {
  const structureDirective = structureSelection
    ? structureToPrompt(structureSelection.structure)
    : 'Select the structure that best fits the material naturally.'

  const writerPersona = writer === 'A'
    ? `Write with a direct, personal voice. Lead with the specific detail. Keep sentences varied in length. ${structureDirective}`
    : `Write with a slightly more reflective voice. Connect the specific to the universal. Use natural rhythm. ${structureDirective}`

  const result = await generate<{
    caption: string
    self_check_passed: boolean
    self_check_note: string
  }>({
    task: 'DEEP_WRITING',
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
    maxTokens: 2048,
    temperature: 0.7,
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

/**
 * Generate a candidate (Runtime V3 handles provider routing).
 */
async function generateCandidateWithChain(
  input: ForgeInput,
  writer: 'A' | 'B',
  structureSelection: { structure: ContentStructure; reason: string } | undefined,
): Promise<ForgeCandidate | null> {
  try {
    return await generateCandidate(input, writer, structureSelection)
  } catch {
    return null
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
    '3. NEVER invent details. Everything must trace back to the source material or interview answers below.',
    '4. NEVER use clickbait ("stop scrolling", "read that again").',
    '5. NEVER use corporate jargon.',
    `6. If mode is opinion, do not claim a specific personal incident happened to ${input.personaName}.`,
    '7. The first 1-2 lines must contain a concrete, specific detail from the interview answers or source material.',
    '8. Performance patterns are weak signals, not rules. Do not sacrifice authenticity for engagement.',
    '9. Interview answers contain REAL personal experiences. Use them as the primary source of personal specificity.',
    '',
  ].filter(Boolean)

  return parts.join('\n')
}

function buildWriterUserPrompt(input: ForgeInput): string {
  const interviewBlock = input.interviewAnswers && input.interviewAnswers.length > 0
    ? `\nPERSONAL EXPERIENCE (from interview — use as primary source of specificity):
"""
${input.interviewAnswers.join('\n\n')}
"""\n`
    : ''

  return `REAL MATERIAL:
"""
${input.sourceMaterial}
"""
${interviewBlock}
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

async function applyAntiSlop(caption: string): Promise<string> {
  let result = caption

  // Remove ALL em dashes (AI tell — banned everywhere)
  result = result.replace(/[\u2014\u2013]/g, (match, offset) => {
    const before = result.slice(0, offset)
    const dashesBefore = (before.match(/[\u2014\u2013]/g) || []).length
    return dashesBefore === 0 ? '—' : '.'
  })

  // Remove "Thoughts?" / "Agree?" / "Am I right?" / "Who else?"
  result = result.replace(/\s*(Thoughts\?|Agree\?|Am I right\?|Who else\?|What do you think\?|Let me know\?)\s*$/gi, '')

  // Remove empty conclusions
  result = result.replace(/\s*(In conclusion|To summarize|The takeaway is|In summary)[^.!?]*[.!?]\s*$/gi, '')

  // Remove "In today's..." openings
  result = result.replace(/^In today'?s[^,]*,\s*/i, '')

  // Remove excessive exclamation marks
  result = result.replace(/!{2,}/g, '.')
  result = result.replace(/!(\s|$)/g, '.$1')

  // Remove emoji-as-bullets
  result = result.replace(/^\s*[^\w\s\-:]\s*/gm, '')

  // Remove thread markers
  result = result.replace(/^\d+\/\d+\s*/gm, '')
  result = result.replace(/🧵\s*/g, '')

  return result.trim()
}

function extractCoreDetail(caption: string, sourceMaterial: string): string {
  const sentences = caption.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15)
  for (const sentence of sentences) {
    if (/\d/.test(sentence) || /specific|exactly|precisely|found|discovered|realized|noticed/i.test(sentence)) {
      return sentence.trim().slice(0, 120)
    }
  }
  return (sentences[0] ?? sourceMaterial.slice(0, 120)).trim()
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
