import type { Profile, ProofItem } from '@/lib/domain/types'
import type { SelfCheck, DraftResult, DraftInput, DraftVariant, DraftCallLog } from '@/lib/ai/draft'
import { baseDraftSystem, buildCorrectiveFeedback, buildUserPrompt, generateDraft } from '@/lib/ai/draft'
import { shouldEscalateToPremium, type CostTierName } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { sanitizeDraft } from '@/lib/facts/sanitize'
import { generate as runtimeGenerate } from '@/lib/ai/runtime'

export type DraftStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'proof'; items: ProofItem[] }
  | { type: 'profile'; profile: Profile | null }
  | { type: 'attempt'; attempt: number; model: string; tier: 'cheap' | 'strong' }
  | { type: 'draft'; chunk: string }
  | { type: 'variant'; draft: DraftVariant }
  | { type: 'selfcheck'; pass: boolean; selfCheck: SelfCheck }
  | { type: 'done'; draft: DraftResult; matchedProof: ProofItem | null }
  | { type: 'error'; message: string }

const SELFCHECK_MARKER = '---SELFCHECK---'

interface RawVariant {
  draft: string
  test_1_reply_or_delete: boolean
  test_1_note: string
  test_2_not_generic: boolean
  test_2_note: string
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'draft',
    'test_1_reply_or_delete',
    'test_1_note',
    'test_2_not_generic',
    'test_2_note',
  ],
  properties: {
    draft: { type: 'string' },
    test_1_reply_or_delete: { type: 'boolean' },
    test_1_note: { type: 'string' },
    test_2_not_generic: { type: 'boolean' },
    test_2_note: { type: 'string' },
  },
} as const

/**
 * Streaming draft pipeline with best-of-two support.
 *
 * Two variants are generated in parallel on the cheap model. The stronger one
 * is streamed to the client token-by-token; the weaker one is emitted as a
 * 'variant' event so the UI can show a one-click swap.
 */
// Vercel Hobby plan caps serverless functions at 10s. Track elapsed time
// and skip attempts that won't finish before the timeout.
const VERCEL_HOBBY_TIMEOUT_MS = 9_500 // leave 500ms buffer

export async function streamDraft(
  input: DraftInput,
  emit: (e: DraftStreamEvent) => void,
  matchedProof: ProofItem | null,
  profile: Profile | null,
  generationMode: 'standard' | 'premium' = 'standard',
): Promise<DraftResult> {
  const streamStart = Date.now()
  const msRemaining = () => VERCEL_HOBBY_TIMEOUT_MS - (Date.now() - streamStart)
  const hasTimeForAttempt = (minMs: number) => msRemaining() > minMs

  emit({ type: 'profile', profile })

  if (!hasProvider()) {
    // DEMO MODE: No API keys configured. Uses demo-only generateDraft().
    // See generateDraft() JSDoc — NOT the production path.
    emit({ type: 'status', message: 'Writing message...' })
    const demo = await generateDraft(input)
    emit({ type: 'draft', chunk: demo.draftText })
    emit({ type: 'selfcheck', pass: demo.passed, selfCheck: demo.selfCheck })
    emit({ type: 'done', draft: demo, matchedProof })
    return demo
  }

  const verdict = input.score.verdict
  if (verdict === 'skip') {
    throw new Error(
      'This lead scored skip. Drafting is only allowed for send and research_more leads.',
    )
  }

  const system = baseDraftSystem(input.styleCard, input.facts)
  const user = buildUserPrompt(input)
  const callLog: DraftCallLog[] = []
  const scoreForGate = input.canonicalScore ?? input.score.total
  const isHighValue = scoreForGate >= 70 || (input.score.total >= 10 && input.score.total <= 12)

  // Route through runtime for health-aware provider selection
  const taskClass = isHighValue ? 'DEEP_WRITING' : 'INTERACTIVE_WRITING'

  // Contextual status messages based on message type (no model/tier details)
  const statusMessage = input.type === 'connection' ? 'Writing connection note...'
    : input.type === 'reply' ? 'Preparing reply...'
    : input.type === 'followup' ? 'Writing follow-up...'
    : 'Writing message...'
  emit({ type: 'status', message: statusMessage })

  // Attempt 1: Runtime handles provider routing (OpenCode Go → Groq → GPT → LongCat)
  const attempt1Timeout = Math.min(12_000, Math.max(5_000, msRemaining() - 2_000))
  const rawA = await runtimeGenerate<RawVariant>({
    task: taskClass,
    system,
    user,
    schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1024,
    temperature: 0.7,
  })
    .then((r) => {
      callLog.push({ costTier: (r.trace.costTier || 'tier1') as CostTierName, host: r.trace.provider, estimatedCostUsd: r.trace.estimatedCostUsd })
      return r.data
    })
    .catch(() => null)

  const variantA = rawA ? normalizeVariant(rawA, input) : null

  if (variantA?.passed) {
    return await streamFinalDraft(input, emit, matchedProof, variantA, null, 'Passed quality gates.', callLog)
  }

  // Attempt 2: Corrective retry with feedback
  if (!hasTimeForAttempt(4_000)) {
    emit({ type: 'status', message: 'Finalizing...' })
    const best = variantA ?? null
    if (best) return await streamFinalDraft(input, emit, matchedProof, best, null, 'Best effort (time budget exhausted).', callLog)
  }

  const escalationDecision = shouldEscalateToPremium({
    primaryPassed: variantA?.passed ?? false,
    primaryScore: variantA ? variantScore(variantA) : 0,
    isHighValue,
    malformedOutput: !variantA,
    attemptCount: callLog.length,
  })

  if (escalationDecision.shouldEscalate || isHighValue) {
    emit({ type: 'status', message: 'Refining draft...' })

    const feedback = variantA ? buildCorrectiveFeedback(
      {
        output: {
          draft: variantA.draftText,
          test_1_reply_or_delete: variantA.selfCheck.test1ReplyOrDelete,
          test_1_note: variantA.selfCheck.test1Note,
          test_2_not_generic: variantA.selfCheck.test2NotGeneric,
          test_2_note: variantA.selfCheck.test2Note,
        },
        codeChecks: variantA.selfCheck.codeChecks,
      },
      input,
    ) : null

    const rawB = await runtimeGenerate<RawVariant>({
      task: 'DEEP_WRITING',
      system,
      user: feedback ? `${user}\n\n${feedback}` : user,
      schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 1024,
      temperature: 0.5,
    })
      .then((r) => {
        callLog.push({ costTier: (r.trace.costTier || 'tier1') as CostTierName, host: r.trace.provider, estimatedCostUsd: r.trace.estimatedCostUsd })
        return r.data
      })
      .catch(() => null)

    const variantB = rawB ? normalizeVariant(rawB, input) : null
    if (variantB?.passed) {
      return await streamFinalDraft(input, emit, matchedProof, variantB, variantA, 'Refined after first attempt.', callLog, escalationDecision.reason)
    }
  }

  // Return best effort
  const best = variantA ?? null
  if (!best) {
    emit({ type: 'status', message: 'Model output failed, using safe fallback draft' })
    const fallback = buildDeterministicFallback(input, callLog)
    emit({ type: 'draft', chunk: fallback.draftText })
    emit({ type: 'selfcheck', pass: fallback.passed, selfCheck: fallback.selfCheck })
    emit({ type: 'done', draft: fallback, matchedProof })
    return fallback
  }

  return await streamFinalDraft(input, emit, matchedProof, best, null, 'Best effort from available providers.', callLog, escalationDecision.reason)
}

async function streamFinalDraft(
  input: DraftInput,
  emit: (e: DraftStreamEvent) => void,
  matchedProof: ProofItem | null,
  primary: ReturnType<typeof normalizeVariant>,
  secondary: ReturnType<typeof normalizeVariant> | null,
  pickReason: string,
  callLog: DraftCallLog[],
  escalationReason?: string,
): Promise<DraftResult> {
  // Stream the primary draft in chunks so the UI feels alive.
  const text = primary.draftText
  const chunkSize = 4
  for (let i = 0; i < text.length; i += chunkSize) {
    emit({ type: 'draft', chunk: text.slice(i, i + chunkSize) })
    // Tiny artificial delay so the client sees token-by-token appearance.
    if (i < text.length - chunkSize) {
      await new Promise((r) => setTimeout(r, 8))
    }
  }

  let qualityGatePassed = primary.passed
  let qualityGateReasons: string[] = []
  try {
    const { evaluateMessage, feelsSurveillance, isGeneric } = await import('@/lib/relay/message-forge')
    const channel = input.type === 'upwork' ? 'upwork' : input.type === 'connection' ? 'connection' : 'dm'
    const evaluation = evaluateMessage(primary.draftText, input.strategy ?? null, channel)
    const surveillance = feelsSurveillance(primary.draftText)
    const generic = isGeneric(primary.draftText, input.lead.company)
    qualityGatePassed = primary.passed && evaluation.passed && !surveillance && !generic
    qualityGateReasons = [...evaluation.reasons]
    if (surveillance) qualityGateReasons.push('Surveillance-like opening')
    if (generic) qualityGateReasons.push('Too generic')
  } catch {
    // Quality gate import failed — use self-check result only.
  }

  emit({ type: 'selfcheck', pass: qualityGatePassed, selfCheck: { ...primary.selfCheck, qualityGateReasons } })

  if (secondary) {
    emit({
      type: 'variant',
      draft: {
        draftText: secondary.draftText,
        selfCheck: secondary.selfCheck,
        passed: secondary.passed,
      },
    })
  }

  // Report the provider that actually produced the accepted output
  // The callLog entry for the winning attempt is the LAST one (most recent)
  const winningCall = callLog.length > 0 ? callLog[callLog.length - 1] : null
  const modelUsed = winningCall
    ? `${winningCall.host}${winningCall.costTier ? ` (${winningCall.costTier})` : ''}`
    : 'unknown'

  const draft: DraftResult = {
    leadId: input.leadId,
    type: input.type,
    draftText: primary.draftText,
    selfCheck: { ...primary.selfCheck, qualityGateReasons },
    passed: qualityGatePassed,
    modelUsed,
    attempts: callLog.length,
    strippedNumbers: primary.strippedNumbers,
    hadEmDash: primary.hadEmDash,
    hadExclamation: primary.hadExclamation,
    requestedCall: primary.requestedCall,
    variant: secondary
      ? {
          draftText: secondary.draftText,
          selfCheck: secondary.selfCheck,
          passed: secondary.passed,
        }
      : undefined,
    pickReason,
    fewShotReason:
      input.fewShotExamples && input.fewShotExamples.length > 0
        ? `Informed by ${input.fewShotExamples.length} real win(s): ${input.fewShotExamples.map((e) => e.company).join(', ')}.`
        : 'No few-shot examples matched this lead.',
    escalationReason,
    callLog,
  }

  emit({ type: 'done', draft, matchedProof })
  return draft
}

function buildDeterministicFallback(input: DraftInput, callLog: DraftCallLog[]): DraftResult {
  const draftText = fallbackText(input)
  const codeChecks = deterministicChecks(draftText, {
    company: input.lead.company,
    evidence: input.extracted.signalEvidence,
  })
  const sanitized = sanitizeDraft(draftText, input.facts)
  const passed = Boolean(codeChecks.companyMentioned && codeChecks.specificEvidenceMentioned && sanitized.strippedNumbers.length === 0 && !sanitized.requestedCall)

  const lastCall = callLog.length > 0 ? callLog[callLog.length - 1] : null
  const modelUsed = lastCall
    ? `${lastCall.host}${lastCall.costTier ? ` (${lastCall.costTier})` : ''}`
    : 'deterministic-fallback'

  return {
    leadId: input.leadId,
    type: input.type,
    draftText: sanitized.text,
    selfCheck: {
      test1ReplyOrDelete: false,
      test1Note: 'Fallback draft used because model variants failed.',
      test2NotGeneric: codeChecks.specificEvidenceMentioned,
      test2Note: codeChecks.specificEvidenceMentioned
        ? 'Draft references lead-specific evidence.'
        : 'Draft is generic because source evidence was missing.',
      codeChecks,
    },
    passed,
    modelUsed,
    attempts: callLog.length,
    strippedNumbers: sanitized.strippedNumbers,
    hadEmDash: sanitized.hadEmDash,
    hadExclamation: sanitized.hadExclamation,
    requestedCall: sanitized.requestedCall,
    callLog,
  }
}

function fallbackText(input: DraftInput): string {
  const name = input.extracted.name ?? input.lead.contactName ?? 'there'
  const company = input.lead.company
  const evidence = input.extracted.signalEvidence?.trim() || `current priorities at ${company}`
  const lastSent = (input.history ?? [])
    .filter((m) => m.sentText && m.sentAt)
    .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
    .at(-1)

  if (input.type === 'followup') {
    return [
      `Hi ${name}, following up on my last note about ${evidence}.`,
      `If this is not a priority for ${company} right now, a quick \"not now\" is perfect and I will close the loop.`,
    ].join(' ')
  }

  if (input.type === 'connection') {
    return `Hi ${name}, noticed ${evidence} — would be worth connecting.`
  }

  if (input.type === 'upwork') {
    return [
      `Hi ${name}, I read your brief and noticed ${evidence}.`,
      `I can help ${company} ship this cleanly and can share a short, concrete approach in one reply if useful.`,
    ].join(' ')
  }

  if (lastSent?.sentText) {
    return [
      `Hi ${name}, quick note after my previous message.`,
      `Given ${evidence}, I can share a focused plan for ${company} in one short reply if that helps.`,
    ].join(' ')
  }

  return [
    `Hi ${name}, noticed ${evidence}.`,
    `If useful, I can send one practical idea for ${company} in a short reply.`,
  ].join(' ')
}

function variantScore(v: {
  passed: boolean
  selfCheck: { test1ReplyOrDelete: boolean; test2NotGeneric: boolean; codeChecks: SelfCheck['codeChecks'] }
}): number {
  let s = v.passed ? 4 : 0
  s += v.selfCheck.test1ReplyOrDelete ? 2 : 0
  s += v.selfCheck.test2NotGeneric ? 2 : 0
  s += v.selfCheck.codeChecks.companyMentioned ? 1 : 0
  s += v.selfCheck.codeChecks.specificEvidenceMentioned ? 1 : 0
  return s
}

function normalizeVariant(
  raw: RawVariant,
  input: DraftInput,
): {
  draftText: string
  selfCheck: SelfCheck
  passed: boolean
  strippedNumbers: string[]
  hadEmDash: boolean
  hadExclamation: boolean
  requestedCall: boolean
} {
  const cleaned = (raw.draft ?? '').trim() || fallbackText(input)
  const codeChecks = deterministicChecks(cleaned, {
    company: input.lead.company,
    evidence: input.extracted.signalEvidence,
  })
  const passed = Boolean(
    raw.test_1_reply_or_delete &&
      raw.test_2_not_generic &&
      codeChecks.companyMentioned &&
      codeChecks.specificEvidenceMentioned,
  )
  const sanitized = sanitizeDraft(cleaned, input.facts)
  return {
    draftText: sanitized.text,
    selfCheck: {
      test1ReplyOrDelete: Boolean(raw.test_1_reply_or_delete),
      test1Note: raw.test_1_note || '',
      test2NotGeneric: Boolean(raw.test_2_not_generic),
      test2Note: raw.test_2_note || '',
      codeChecks,
    },
    passed: passed && sanitized.strippedNumbers.length === 0 && !sanitized.requestedCall,
    strippedNumbers: sanitized.strippedNumbers,
    hadEmDash: sanitized.hadEmDash,
    hadExclamation: sanitized.hadExclamation,
    requestedCall: sanitized.requestedCall,
  }
}

function pickBestVariant(
  a: ReturnType<typeof normalizeVariant> | null,
  b: ReturnType<typeof normalizeVariant> | null,
): {
  primary: ReturnType<typeof normalizeVariant>
  secondary: ReturnType<typeof normalizeVariant> | null
  pickReason: string
} {
  if (a && !b) return { primary: a, secondary: null, pickReason: 'Only variant A succeeded.' }
  if (b && !a) return { primary: b, secondary: null, pickReason: 'Only variant B succeeded.' }
  if (!a && !b) {
    // Unreachable in practice because we guard upstream, but satisfies types.
    throw new Error('Both variants failed.')
  }

  const sa = variantScore(a!)
  const sb = variantScore(b!)

  if (sa >= sb) {
    return {
      primary: a!,
      secondary: b,
      pickReason:
        sa === sb
          ? 'Both variants scored the same. Showing variant A by default.'
          : 'Variant A scored higher on self-check + code checks.',
    }
  }

  return {
    primary: b!,
    secondary: a,
    pickReason: 'Variant B scored higher on self-check + code checks.',
  }
}

function deterministicChecks(
  draft: string,
  leadTokens: { company: string | null; evidence: string | null },
): SelfCheck['codeChecks'] {
  const c = leadTokens.company?.toLowerCase() ?? ''
  const evidenceWords =
    leadTokens.evidence
      ?.toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 5) ?? []

  const companyMentioned = c.length > 0 ? draft.toLowerCase().includes(c) : true
  const specificEvidenceMentioned = evidenceWords.some((w) =>
    draft.toLowerCase().includes(w),
  )
  return { companyMentioned, specificEvidenceMentioned }
}

function parseSelfCheckBlock(raw: string): {
  test_1_reply_or_delete?: boolean
  test_1_note?: string
  test_2_not_generic?: boolean
  test_2_note?: string
} | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
  const lastObj = cleaned.lastIndexOf('{')
  const lastClose = cleaned.lastIndexOf('}')
  if (lastObj >= 0 && lastClose > lastObj) {
    try {
      return JSON.parse(cleaned.slice(lastObj, lastClose + 1)) as Record<string, unknown>
    } catch {
      // Fall through.
    }
  }
  return null
}

export { baseDraftSystem, buildUserPrompt, generateDraft }
