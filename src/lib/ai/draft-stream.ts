import type { Profile, ProofItem } from '@/lib/domain/types'
import type { SelfCheck, DraftResult, DraftInput } from '@/lib/ai/draft'
import { baseDraftSystem, buildUserPrompt, generateDraft } from '@/lib/ai/draft'
import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { streamChatText } from '@/lib/ai/provider'
import { sanitizeDraft } from '@/lib/facts/sanitize'

export type DraftStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'proof'; items: ProofItem[] }
  | { type: 'profile'; profile: Profile | null }
  | { type: 'attempt'; attempt: number; model: string; tier: 'cheap' | 'strong' }
  | { type: 'draft'; chunk: string }
  | { type: 'selfcheck'; pass: boolean; selfCheck: SelfCheck }
  | { type: 'done'; draft: DraftResult; matchedProof: ProofItem | null }
  | { type: 'error'; message: string }

const SELFCHECK_MARKER = '---SELFCHECK---'

/**
 * Streaming draft pipeline. The draft AND the self-check live in a single
 * model call. The model streams the draft message, writes the marker, then
 * finishes with the JSON self-check block on the same output. The marker is
 * stripped from the stream so the client sees only the clean draft text token
 * by token; after the stream ends the JSON is parsed server-side.
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

  const model = pickModel('draft').model

  emit({ type: 'status', message: 'Drafting in your voice' })

  const firstResult = await streamOneAttempt(input, model, 0, emit)

  if (firstResult.check.passed) {
    const draft = finishDraft(
      input,
      firstResult.draftText,
      firstResult.check,
      [model],
      1,
    )
    emit({ type: 'selfcheck', pass: true, selfCheck: draft.selfCheck })
    emit({ type: 'done', draft, matchedProof })
    return draft
  }

  emit({ type: 'status', message: 'Rewriting once — the self-check flagged something' })

  const secondResult = await streamOneAttempt(input, model, 1, emit)

  const draft = finishDraft(
    input,
    secondResult.draftText,
    secondResult.check,
    [model],
    2,
  )
  emit({ type: 'selfcheck', pass: draft.passed, selfCheck: draft.selfCheck })
  emit({ type: 'done', draft, matchedProof })
  return draft
}

async function streamOneAttempt(
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
    markerIdx >= 0 ? full.slice(0, markerIdx) : full.slice(0, full.lastIndexOf('\n') + 1 || full.length)
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
    test1 &&
    test2 &&
    codeChecks.companyMentioned &&
    codeChecks.specificEvidenceMentioned

  const selfCheck: SelfCheck = {
    test1ReplyOrDelete: test1,
    test1Note,
    test2NotGeneric: test2,
    test2Note,
    codeChecks,
  }

  return { draftText, check: { passed, selfCheck } }
}

/**
 * The streaming prompt asks for the draft first, then a marker and a JSON
 * self-check block. Models occasionally stray and wrap it in markdown fences
 * or drop extra commentary; this helper parses as best it can.
 */
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

function finishDraft(
  input: DraftInput,
  text: string,
  check: { passed: boolean; selfCheck: SelfCheck },
  modelsUsed: string[],
  attempts: number,
): DraftResult {
  const sanitized = sanitizeDraft(text, input.facts)
  const passed = check.passed && sanitized.strippedNumbers.length === 0
  return {
    leadId: input.leadId,
    type: input.type,
    draftText: sanitized.text,
    selfCheck: check.selfCheck,
    passed,
    modelUsed: modelsUsed.join(' then '),
    attempts,
    strippedNumbers: sanitized.strippedNumbers,
    hadEmDash: sanitized.hadEmDash,
  }
}

export { baseDraftSystem, buildUserPrompt, generateDraft }