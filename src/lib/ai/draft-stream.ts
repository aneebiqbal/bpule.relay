import type { Profile, ProofItem } from '@/lib/domain/types'
import type { SelfCheck, DraftResult, DraftInput, DraftVariant, DraftCallLog } from '@/lib/ai/draft'
import { baseDraftSystem, buildCorrectiveFeedback, buildUserPrompt, generateDraft } from '@/lib/ai/draft'
import { buildLongcatDraftChain, buildOpenaiDraftChain, pickDraftChain, tier2Chain } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { streamChatText, structuredJsonChain } from '@/lib/ai/provider'
import { sanitizeDraft } from '@/lib/facts/sanitize'

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
export async function streamDraft(
  input: DraftInput,
  emit: (e: DraftStreamEvent) => void,
  matchedProof: ProofItem | null,
  profile: Profile | null,
): Promise<DraftResult> {
  emit({ type: 'status', message: 'Reading the profile' })
  emit({ type: 'profile', profile })

  if (!hasProvider()) {
    emit({ type: 'status', message: 'Drafting in your voice' })
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
  const longcatChain = buildLongcatDraftChain()
  const openaiChain = buildOpenaiDraftChain()
  const callLog: DraftCallLog[] = []

  emit({ type: 'status', message: 'Drafting two variants in parallel (LongCat + OpenAI)' })
  emit({ type: 'attempt', attempt: 0, model: 'longcat+openai', tier: 'cheap' })

  // Best-of-two from two distinct model families. LongCat-2.0 is variant A,
  // OpenAI is variant B. Each chain has Groq as a built-in fallback, so one
  // provider's outage doesn't block the draft.
  const [rawA, rawB] = await Promise.all([
    structuredJsonChain<RawVariant>(longcatChain, { system, user, schema: DRAFT_SCHEMA })
      .then((r) => {
        callLog.push({ costTier: r.costTier, host: r.host, estimatedCostUsd: r.estimatedCostUsd })
        return r.data
      })
      .catch(() => null),
    structuredJsonChain<RawVariant>(openaiChain, { system, user, schema: DRAFT_SCHEMA })
      .then((r) => {
        callLog.push({ costTier: r.costTier, host: r.host, estimatedCostUsd: r.estimatedCostUsd })
        return r.data
      })
      .catch(() => null),
  ])

  const variantA = rawA ? normalizeVariant(rawA, input) : null
  const variantB = rawB ? normalizeVariant(rawB, input) : null

  if (!variantA && !variantB) {
    emit({ type: 'status', message: 'Model output failed, using safe fallback draft' })
    const fallback = buildDeterministicFallback(input, callLog)
    emit({ type: 'draft', chunk: fallback.draftText })
    emit({ type: 'selfcheck', pass: fallback.passed, selfCheck: fallback.selfCheck })
    emit({ type: 'done', draft: fallback, matchedProof })
    return fallback
  }

  let { primary, secondary, pickReason } = pickBestVariant(variantA, variantB)

  // Escalate to tier 2 (DeepSeek V4 Pro) when the lead is a high-value send
  // (score 10+) or neither variant passed self-check — same trigger as
  // extraction's precision pass, on the drafting side.
  const tier2 = tier2Chain()
  if ((input.score.total >= 10 || !primary.passed) && tier2.length > 0) {
    try {
      const escalatedRaw = await structuredJsonChain<RawVariant>(tier2, { system, user, schema: DRAFT_SCHEMA })
      callLog.push({
        costTier: escalatedRaw.costTier,
        host: escalatedRaw.host,
        estimatedCostUsd: escalatedRaw.estimatedCostUsd,
      })
      const escalated = normalizeVariant(escalatedRaw.data, input)
      if (escalated.passed && !primary.passed) {
        secondary = primary
        primary = escalated
        pickReason = 'Escalated to the precision tier: the lead scored 10+ or the first pass did not clear both self-checks.'
      } else if (escalated.passed === primary.passed && variantScore(escalated) > variantScore(primary)) {
        secondary = primary
        primary = escalated
        pickReason = 'Escalated to the precision tier: the lead scored 10+ or the first pass did not clear both self-checks.'
      }
    } catch {
      // Keep the tier 1 draft if the precision pass fails outright.
    }
  }

  // Corrective retry: if the draft still fails after best-of-two (and any
  // paid escalation), retry once more on the free tier with explicit
  // feedback about exactly what failed. Without this, an environment with
  // no paid tier configured (tier2Chain() empty) would stream a failing
  // draft to the rep with zero attempt to fix it.
  if (!primary.passed) {
    const feedback = buildCorrectiveFeedback(
      {
        output: {
          draft: primary.draftText,
          test_1_reply_or_delete: primary.selfCheck.test1ReplyOrDelete,
          test_1_note: primary.selfCheck.test1Note,
          test_2_not_generic: primary.selfCheck.test2NotGeneric,
          test_2_note: primary.selfCheck.test2Note,
        },
        codeChecks: primary.selfCheck.codeChecks,
      },
      input,
    )
    if (feedback) {
      try {
        emit({ type: 'status', message: 'Rewriting after a failed self-check' })
        const groqChain = pickDraftChain()
        const retriedRaw = await structuredJsonChain<RawVariant>(groqChain, {
          system,
          user: `${user}\n\n${feedback}`,
          schema: DRAFT_SCHEMA,
        })
        callLog.push({
          costTier: retriedRaw.costTier,
          host: retriedRaw.host,
          estimatedCostUsd: retriedRaw.estimatedCostUsd,
        })
        const retried = normalizeVariant(retriedRaw.data, input)
        const better =
          retried.passed && !primary.passed
            ? true
            : retried.passed === primary.passed && variantScore(retried) > variantScore(primary)
        if (better) {
          secondary = primary
          primary = retried
          pickReason = 'Rewritten after the first pass failed its own self-check, with the specific failure fed back in.'
        }
      } catch {
        // Keep the best draft so far if the corrective retry fails outright.
      }
    }
  }

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

  // Run the hard quality gate evaluation
  let qualityGatePassed = primary.passed
  let qualityGateReasons: string[] = []
  try {
    const { evaluateMessage } = await import('@/lib/relay/message-forge')
    const evaluation = evaluateMessage(primary.draftText, input.strategy ?? null, input.type === 'upwork' ? 'upwork' : input.type === 'connection' ? 'connection' : 'dm')
    qualityGatePassed = primary.passed && evaluation.passed
    qualityGateReasons = evaluation.reasons
  } catch {
    // If quality gate fails, fall back to the self-check result
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

  const draft: DraftResult = {
    leadId: input.leadId,
    type: input.type,
    draftText: primary.draftText,
    selfCheck: { ...primary.selfCheck, qualityGateReasons },
    passed: qualityGatePassed,
    modelUsed: callLog.map((c) => `${c.costTier}:${c.host}`).join(', ') || 'unknown',
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
    modelUsed: callLog.map((c) => `${c.costTier}:${c.host}`).join(', ') || 'deterministic-fallback',
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
    return `Hi ${name}, noticed ${evidence} at ${company}. Open to connecting?`
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

/**
 * Legacy single-attempt streaming. Kept for scenarios where you truly want
 * one streamed call (e.g. strong-model fallback or debugging).
 */
export async function streamOneAttemptLegacy(
  input: DraftInput,
  model: string,
  attempt: number,
  emit: (e: DraftStreamEvent) => void,
): Promise<{ draftText: string; check: { passed: boolean; selfCheck: SelfCheck } }> {
  emit({ type: 'attempt', attempt, model, tier: 'strong' })

  const marker = SELFCHECK_MARKER
  const lookbehind = marker.length + 4
  let buffered = ''
  let shownCount = 0
  let markerIdx = -1
  let done = false

  const full = await streamChatText({
    model,
    system: baseDraftSystem(input.styleCard, input.facts, { asPlainText: true }),
    user: buildUserPrompt(input, { asPlainText: true }),
    onStatus: (message) => emit({ type: 'status', message }),
    onChunk: (delta) => {
      if (done) return
      buffered += delta
      if (markerIdx < 0) {
        const idx = buffered.indexOf(marker)
        if (idx >= 0) {
          markerIdx = idx
          const before = buffered.slice(0, idx)
          if (before.length > shownCount) {
            emit({ type: 'draft', chunk: before.slice(shownCount) })
            shownCount = before.length
          }
          done = true
          return
        }
        const safeLen = Math.max(0, buffered.length - lookbehind)
        if (safeLen > shownCount) {
          emit({ type: 'draft', chunk: buffered.slice(shownCount, safeLen) })
          shownCount = safeLen
        }
      }
    },
  })

  const draftPart =
    markerIdx >= 0
      ? full.slice(0, markerIdx)
      : full.slice(0, full.lastIndexOf('\n') + 1 || full.length)
  const jsonPart = markerIdx >= 0 ? full.slice(markerIdx + marker.length) : ''

  const remaining = draftPart.length > shownCount ? draftPart.slice(shownCount) : ''
  if (remaining) emit({ type: 'draft', chunk: remaining })

  const draftText = draftPart.trim()
  if (!draftText) {
    return {
      draftText: '',
      check: {
        passed: false,
        selfCheck: {
          test1ReplyOrDelete: false,
          test1Note: 'The model returned an empty draft.',
          test2NotGeneric: false,
          test2Note: 'The model returned an empty draft.',
          codeChecks: { companyMentioned: false, specificEvidenceMentioned: false },
        },
      },
    }
  }

  const rawCheck = parseSelfCheckBlock(jsonPart)

  const test1 = Boolean(rawCheck?.test_1_reply_or_delete ?? false)
  const test1Note = rawCheck?.test_1_note || 'No self-check note was produced.'
  const test2 = Boolean(rawCheck?.test_2_not_generic ?? false)
  const test2Note = rawCheck?.test_2_note || 'No self-check note was produced.'

  const codeChecks = deterministicChecks(draftText, {
    company: input.lead.company,
    evidence: input.extracted.signalEvidence,
  })

  const passed =
    test1 && test2 && codeChecks.companyMentioned && codeChecks.specificEvidenceMentioned

  const selfCheck: SelfCheck = {
    test1ReplyOrDelete: test1,
    test1Note,
    test2NotGeneric: test2,
    test2Note,
    codeChecks,
  }

  return { draftText, check: { passed, selfCheck } }
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
