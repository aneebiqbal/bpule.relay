import type { Profile, ProofItem } from '@/lib/domain/types'
import type { SelfCheck, DraftResult, DraftInput, DraftVariant } from '@/lib/ai/draft'
import { baseDraftSystem, buildUserPrompt, generateDraft } from '@/lib/ai/draft'
import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { streamChatText, structuredJson } from '@/lib/ai/provider'
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
  const cheap = pickModel('draft-variant')

  emit({ type: 'status', message: 'Drafting two variants in parallel' })
  emit({ type: 'attempt', attempt: 0, model: cheap.model, tier: 'cheap' })

  // Best-of-two: generate both variants in parallel using the cheap model.
  const [rawA, rawB] = await Promise.all([
    structuredJson<RawVariant>({
      model: cheap.model,
      system,
      user,
      schema: DRAFT_SCHEMA,
    }).catch(() => null),
    structuredJson<RawVariant>({
      model: cheap.model,
      system,
      user,
      schema: DRAFT_SCHEMA,
    }).catch(() => null),
  ])

  const variantA = rawA ? normalizeVariant(rawA, input) : null
  const variantB = rawB ? normalizeVariant(rawB, input) : null

  if (!variantA && !variantB) {
    throw new Error('Both draft variants failed. Try again.')
  }

  const { primary, secondary, pickReason } = pickBestVariant(variantA, variantB)

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

  emit({ type: 'selfcheck', pass: primary.passed, selfCheck: primary.selfCheck })

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
    selfCheck: primary.selfCheck,
    passed: primary.passed,
    modelUsed: cheap.model,
    attempts: 1,
    strippedNumbers: primary.strippedNumbers,
    hadEmDash: primary.hadEmDash,
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
  }

  emit({ type: 'done', draft, matchedProof })
  return draft
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
} {
  const cleaned = (raw.draft ?? '').trim()
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
    passed: passed && sanitized.strippedNumbers.length === 0,
    strippedNumbers: sanitized.strippedNumbers,
    hadEmDash: sanitized.hadEmDash,
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

  const score = (v: NonNullable<typeof a>) => {
    let s = 0
    if (v.passed) s += 4
    if (v.selfCheck.test1ReplyOrDelete) s += 2
    if (v.selfCheck.test2NotGeneric) s += 2
    if (v.selfCheck.codeChecks.companyMentioned) s += 1
    if (v.selfCheck.codeChecks.specificEvidenceMentioned) s += 1
    return s
  }

  const sa = score(a!)
  const sb = score(b!)

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
