import type { DraftResult, SelfCheck } from '@/lib/ai/draft'
// generateDraft is DEMO-ONLY — used here for eval tooling without API keys.
// See generateDraft() JSDoc in draft.ts.
import { generateDraft, type DraftInput } from '@/lib/ai/draft'
import { streamDraft } from '@/lib/ai/draft-stream'


export interface GoldenCase {
  id: string
  leadId: string
  knownReplied: boolean
  sentText: string
  leadCompany: string
  leadEvidence: string
  input: DraftInput
}

export interface EvalCaseResult {
  caseId: string
  knownReplied: boolean
  draftText: string
  passed: boolean
  selfCheck: SelfCheck
  companyMentioned: boolean
  evidenceMentioned: boolean
  lengthOk: boolean
  // Semantic similarity to the known-good sent text (0-1).
  similarity: number
}

export interface EvalRunResult {
  promptVersion: string
  goldenSetSize: number
  replyRateScore: number
  selfCheckPassRate: number
  companyMentionRate: number
  evidenceMentionRate: number
  overallScore: number
  caseResults: EvalCaseResult[]
}

/**
 * Run the current draft pipeline against every case in the golden set and
 * return a scored result. This turns "I think this prompt is better" into
 * a number against real data.
 *
 * IMPORTANT: this is async and can take a while (one model call per case).
 * Run it from an admin API route or background job, not in the request loop.
 */
export async function runEval(
  cases: GoldenCase[],
  promptVersion: string,
): Promise<EvalRunResult> {
  const caseResults: EvalCaseResult[] = []

  for (const c of cases) {
    // Run the draft pipeline (non-streaming) against the case input.
    let draft: DraftResult
    try {
      draft = await generateDraft(c.input)
    } catch {
      // If drafting fails for a case, score it as a zero.
      caseResults.push({
        caseId: c.id,
        knownReplied: c.knownReplied,
        draftText: '',
        passed: false,
        selfCheck: {
          test1ReplyOrDelete: false,
          test1Note: 'Draft generation failed.',
          test2NotGeneric: false,
          test2Note: 'Draft generation failed.',
          codeChecks: { companyMentioned: false, specificEvidenceMentioned: false },
        },
        companyMentioned: false,
        evidenceMentioned: false,
        lengthOk: false,
        similarity: 0,
      })
      continue
    }

    const companyMentioned = draft.draftText.toLowerCase().includes(c.leadCompany.toLowerCase())
    const evidenceMentioned =
      c.leadEvidence.length > 0
        ? c.leadEvidence
            .toLowerCase()
            .split(/\W+/)
            .filter((w) => w.length >= 5)
            .some((w) => draft.draftText.toLowerCase().includes(w))
        : true

    const lengthOk = draft.draftText.length > 20 && draft.draftText.length < 1200
    const similarity = cosineSimilarityText(draft.draftText, c.sentText)

    caseResults.push({
      caseId: c.id,
      knownReplied: c.knownReplied,
      draftText: draft.draftText,
      passed: draft.passed,
      selfCheck: draft.selfCheck,
      companyMentioned,
      evidenceMentioned,
      lengthOk,
      similarity,
    })
  }

  const n = caseResults.length || 1
  const replyRateScore = Math.round(
    (caseResults.filter((r) => r.knownReplied && r.passed).length /
      Math.max(caseResults.filter((r) => r.knownReplied).length, 1)) *
      100,
  )
  const selfCheckPassRate = Math.round(
    (caseResults.filter((r) => r.passed).length / n) * 100,
  )
  const companyMentionRate = Math.round(
    (caseResults.filter((r) => r.companyMentioned).length / n) * 100,
  )
  const evidenceMentionRate = Math.round(
    (caseResults.filter((r) => r.evidenceMentioned).length / n) * 100,
  )

  // Overall score weights: self-check 40%, company 20%, evidence 20%, similarity 20%.
  const overallScore = Math.round(
    selfCheckPassRate * 0.4 +
      companyMentionRate * 0.2 +
      evidenceMentionRate * 0.2 +
      Math.round(
        caseResults.reduce((s, r) => s + r.similarity, 0) / n * 100,
      ) *
        0.2,
  )

  return {
    promptVersion,
    goldenSetSize: cases.length,
    replyRateScore,
    selfCheckPassRate,
    companyMentionRate,
    evidenceMentionRate,
    overallScore,
    caseResults,
  }
}

/**
 * Streaming eval variant. Used when you want to watch progress token-by-token.
 */
export async function runEvalStreaming(
  c: GoldenCase,
  emit: (e: {
    type: 'caseStart' | 'caseDone' | 'caseFail'
    caseId?: string
    result?: EvalCaseResult
    error?: string
  }) => void,
): Promise<EvalCaseResult> {
  emit({ type: 'caseStart', caseId: c.id })

  let draftText = ''
  let passed = false
  let selfCheck: SelfCheck = {
    test1ReplyOrDelete: false,
    test1Note: '',
    test2NotGeneric: false,
    test2Note: '',
    codeChecks: { companyMentioned: false, specificEvidenceMentioned: false },
  }

  try {
    await streamDraft(
      c.input,
      (event) => {
        if (event.type === 'draft') {
          draftText += event.chunk
        }
        if (event.type === 'selfcheck') {
          passed = event.pass
          selfCheck = event.selfCheck
        }
        if (event.type === 'done') {
          draftText = event.draft.draftText
          passed = event.draft.passed
          selfCheck = event.draft.selfCheck
        }
      },
      c.input.matchedProof ?? null,
      c.input.profile ?? null,
    )
  } catch (err) {
    emit({ type: 'caseFail', caseId: c.id, error: err instanceof Error ? err.message : String(err) })
    return {
      caseId: c.id,
      knownReplied: c.knownReplied,
      draftText: '',
      passed: false,
      selfCheck: {
        test1ReplyOrDelete: false,
        test1Note: 'Draft generation failed.',
        test2NotGeneric: false,
        test2Note: 'Draft generation failed.',
        codeChecks: { companyMentioned: false, specificEvidenceMentioned: false },
      },
      companyMentioned: false,
      evidenceMentioned: false,
      lengthOk: false,
      similarity: 0,
    }
  }

  const companyMentioned = draftText.toLowerCase().includes(c.leadCompany.toLowerCase())
  const evidenceMentioned =
    c.leadEvidence.length > 0
      ? c.leadEvidence
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length >= 5)
          .some((w) => draftText.toLowerCase().includes(w))
      : true

  const lengthOk = draftText.length > 20 && draftText.length < 1200
  const similarity = cosineSimilarityText(draftText, c.sentText)

  const result: EvalCaseResult = {
    caseId: c.id,
    knownReplied: c.knownReplied,
    draftText,
    passed,
    selfCheck,
    companyMentioned,
    evidenceMentioned,
    lengthOk,
    similarity,
  }

  emit({ type: 'caseDone', caseId: c.id, result })
  return result
}

/**
 * Very rough text similarity based on word-set overlap.
 * Returns 0-1; 1 means identical word sets, 0 means no overlap.
 */
function cosineSimilarityText(a: string, b: string): number {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.length === 0 || tb.length === 0) return 0
  const setA = new Set(ta)
  const setB = new Set(tb)
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  return intersection.size / Math.sqrt(setA.size * setB.size)
}
