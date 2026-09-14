import type {
  ExtractedLead,
  Fact,
  Lead,
  MatchedProof,
  Message,
  OutreachStrategy,
  Play,
  Profile,
  ProofItem,
  SafeFact,
  ScoreResult,
  StyleCard,
} from '@/lib/domain/types'
import {
  buildLongcatDraftChain,
  buildOpenaiDraftChain,
  pickDraftChain,
  tier2Chain,
  shouldEscalateToPremium,
  type ChainStep,
  type CostTierName,
} from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJsonChain } from '@/lib/ai/provider'
import { injectStyleCard } from '@/lib/style/inject'
import { signalById } from '@/lib/score/signals'
import { pickPlayForSignal } from '@/lib/score/plays'
import { sanitizeDraft, siteIsLive } from '@/lib/facts/sanitize'
import { classifyRoleFromTitle, rolePromptGuidance } from '@/lib/leads/targeting'
import { strategyToPromptBlock } from '@/lib/relay/outreach-strategy'
import {
  ANTI_AI_RULES,
  FACTUALITY_RULES,
  SURVEILLANCE_RULES,
  CTA_RULES,
  SPECIFICITY_RULES,
  VOICE_RULES,
  FORMATTING_RULES,
} from '@/lib/ai/prompts'

/** One entry per model call made while producing one draft, for cost/tier reporting on the route. */
export interface DraftCallLog {
  costTier: CostTierName
  host: string
  estimatedCostUsd: number
}

export type DraftMessageType = 'dm' | 'connection' | 'upwork' | 'followup' | 'reply'

export interface SelfCheck {
  test1ReplyOrDelete: boolean
  test1Note: string
  test2NotGeneric: boolean
  test2Note: string
  /** Deterministic checks that run in code after the model self-check. */
  codeChecks: {
    companyMentioned: boolean
    specificEvidenceMentioned: boolean
  }
  /** Quality gate reasons from the hard message quality evaluation. */
  qualityGateReasons?: string[]
}

export interface DraftVariant {
  draftText: string
  selfCheck: SelfCheck
  passed: boolean
}

export interface DraftResult {
  leadId: string
  type: DraftMessageType
  draftText: string
  selfCheck: SelfCheck
  passed: boolean
  modelUsed: string
  attempts: number
  strippedNumbers: string[]
  hadEmDash: boolean
  hadExclamation: boolean
  /** True if a call/meeting/chat was requested — always a failure; the offer is always the free Read. */
  requestedCall: boolean
  /** The second variant, when best-of-two drafting is enabled. */
  variant?: DraftVariant
  /** Why the primary draft was picked over the variant. */
  pickReason?: string
  /** Which few-shot examples informed this draft. */
  fewShotReason?: string
  /** Reason for GPT escalation, if applicable. */
  escalationReason?: string
  /** Every model call made while producing this draft, for cost/tier reporting. */
  callLog: DraftCallLog[]
}

export interface DraftInput {
  leadId: string
  lead: Lead
  extracted: ExtractedLead
  score: ScoreResult
  type: DraftMessageType
  styleCard: StyleCard | null
  facts: Fact[]
  plays: Play[]
  /** Earlier messages on this lead, newest last. Used for follow-ups. */
  history?: Message[]
  /** The profile the draft is being written from. */
  profile?: Profile | null
  /** Proof item matched to this lead's tags, referenced instead of a generic pitch. */
  matchedProof?: ProofItem | null
  /** Few-shot examples from real wins to inject into the prompt. */
  fewShotExamples?: { company: string; signalEvidence: string; sentText: string }[]
  /** Outreach strategy computed before message generation. */
  strategy?: OutreachStrategy | null
  /** Safe-to-mention facts about the lead. */
  safeFacts?: SafeFact[]
  /** Matched proof cards from the sender's profile. */
  matchedProofCards?: MatchedProof[]
  /** Conversation context for replies. */
  conversationContext?: string | null
}

interface DraftModelOutput {
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

const TWO_TESTS = `Before returning the draft, judge it yourself against these two fixed tests and include the results in the JSON.

Test 1: Would a senior engineer at the target company reply to this, or delete it? It must be specific to their situation and worth 30 seconds of their time. Pass only if they would reply.
Test 2: Could this draft be sent to a different company unchanged? If swapping the company name changes nothing, it is too generic. Pass only if the draft is tied to this company's specific signal and would not survive a company swap.

Write out the draft first, then honestly run the tests on it, then return the final draft plus test_1_reply_or_delete, test_1_note, test_2_not_generic, test_2_note. Do not weaken the tests to make them pass.`

function messageKind(input: DraftInput): string {
  switch (input.type) {
    case 'dm':
      return 'LinkedIn DM (first touch, short)'
    case 'connection':
      return 'LinkedIn connection note (under 300 chars, no pitch)'
    case 'upwork':
      return 'Upwork cover letter'
    case 'followup':
      return 'Follow-up message (second touch). The prospect read or opened the first message but has not replied. Keep it to two or three sentences, reference your earlier message, and give an easy way to say no.'
    case 'reply':
      return 'Reply to a prospect who wrote back'
  }
}

export function baseDraftSystem(
  styleCard: StyleCard | null,
  facts: Fact[],
  opts?: { asPlainText?: boolean },
): string {
  const styleBlock = injectStyleCard(styleCard)
  const siteBlock = siteIsLive(facts)
    ? 'The public site is live. A CTA may reference it, but never ask for a call — the offer is always a free Read (a short written review of their product/Stack/status), never a chat or meeting.'
    : 'The public site is NOT live yet. Every call to action must land in a reply to this message or a free Read offer. Never link to a website that does not exist. Never ask for a call or meeting — the offer is always a free Read.'
  const testsBlock = opts?.asPlainText
    ? `Write the draft, then on the line after it write the marker ---SELFCHECK--- followed by ONLY this single JSON object:
{"test_1_reply_or_delete": true or false, "test_1_note": "one sentence", "test_2_not_generic": true or false, "test_2_note": "one sentence"}

Test 1: Would a senior engineer at the target company reply to this, or delete it? Pass only if they would reply.
Test 2: Could this draft be sent to a different company unchanged? Pass only if it is tied to this company's specific signal and would not survive a company swap.

Write the draft first, then honestly run the tests on it, then the marker and the JSON. Do not weaken the tests to make them pass. No commentary before the draft or after the JSON.`
    : TWO_TESTS
  return [
    'You write cold outreach messages for a software consultant. The message is copy-pasted by a human; you never send anything yourself.',
    FACTUALITY_RULES,
    'When the message lists a matched past project, reference it specifically; that referencing is the personalization. Without a matched project, stay with the signal, never invent a case.',
    'Rule on client names: a client may only be named when the matched proof item explicitly says permission is on file. Otherwise describe the project by shape (a trading dashboard, an internal QA tool) and never name the client.',
    VOICE_RULES,
    FORMATTING_RULES,
    CTA_RULES,
    SPECIFICITY_RULES,
    ANTI_AI_RULES,
    'Sound like a real person who read their profile, not a template. Vary sentence length.',
    SURVEILLANCE_RULES,
    'Do not pitch too early. Default first-touch goal: earn a reply, not sell the entire service.',
    siteBlock,
    styleBlock ? `SENDER VOICE (mandatory):\n${styleBlock}` : '',
    testsBlock,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function buildFewShotBlock(
  examples: { company: string; signalEvidence: string; sentText: string }[],
): string {
  if (examples.length === 0) return ''
  const lines: string[] = [
    'Here are real messages that got a reply from a similar lead. Use them as a style reference, not a template to copy word for word.',
  ]
  for (const ex of examples) {
    lines.push('')
    lines.push(`Example (lead: ${ex.company}, signal: ${ex.signalEvidence || 'unknown'}):`)
    lines.push(ex.sentText)
  }
  lines.push('')
  lines.push('Now write a fresh message for the lead below. Do not copy the example verbatim.')
  return lines.join('\n')
}

export function buildUserPrompt(
  input: DraftInput,
  opts?: { asPlainText?: boolean },
): string {
  const signal = signalById(input.extracted.signalType)
  const play = pickPlayForSignal(input.plays, input.extracted.signalType)
  const role =
    input.extracted.roleCategory ??
    (input.lead.contactTitle ? classifyRoleFromTitle(input.lead.contactTitle) : 'other')
  const factsTable = filterFacts(input.facts)

  // Static-first ordering for prompt caching: the approved facts and the play
  // template rarely change between calls; the lead and the identity are the
  // only per-lead variable parts and go last.
  const factsBlock = [
    'APPROVED FACTS FOR THIS CALL (the only numbers and claims allowed):',
    factsTable.map((f) => `- ${f.label}: ${f.value}`).join('\n') || '(none relevant)',
  ].join('\n')

  const playBlock = play
    ? `MATCHED PLAY TEMPLATE "${play.name}":\n${play.templateShape}`
    : 'No matched play; write a simple direct first message.'

  const roleBlock = `CONTACT ROLE: ${role}\n${rolePromptGuidance(role)}`

  const proof = input.matchedProof
  const proofBlock = proof
    ? [
        `MATCHED PAST PROJECT (this is relevant prior work you delivered; reference it as your own):`,
        `- Summary: ${proof.projectSummary}`,
        proof.reviewQuote ? `- What the client said: ${proof.reviewQuote}` : null,
        proof.permissionOnFile && proof.clientName ? `- Client may be named: ${proof.clientName}` : '- Client may NOT be named. Describe the project by shape only.',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No matched past project. Do not invent one.'

  const profile = input.profile
  const profileBlock = profile
    ? [
        'THE SENDER IDENTITY (the profile this is sent from, do not contradict it):',
        profile.label ? `- Label: ${profile.label}` : null,
        `- Platform: ${profile.platform}`,
        profile.headline ? `- Headline: ${profile.headline}` : null,
        profile.profileUrl ? `- Profile URL: ${profile.profileUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const leadBlock = [
    'THE LEAD (factual only):',
    `Company: ${input.lead.company}`,
    `Contact: ${input.extracted.name ?? 'unknown'}${input.extracted.title ? `, ${input.extracted.title}` : ''}`,
    `Source URL: ${input.extracted.url ?? 'none'}`,
    `Detected signal: ${signal?.short ?? 'unknown'} (${signal?.description ?? ''})`,
    `Evidence: ${input.extracted.signalEvidence || 'none'}`,
    input.extracted.verbatimQuote ? `Verbatim quote from them: ${input.extracted.verbatimQuote}` : '',
    input.lead.rawInput ? '\nRaw research notes (context only, never quote words that are not marked verbatim):\n' + input.lead.rawInput : '',
  ]
    .filter(Boolean)
    .join('\n')

  const historyBlock = (() => {
    const sent = (input.history ?? [])
      .filter((m) => m.sentText && m.sentAt)
      .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
    if (sent.length === 0) return ''
    return `What the sender already wrote on this lead (newest last), so a follow-up can reference it:\n${sent
      .map((m) => `- [${m.type}] ${m.sentText}`)
      .reverse()
      .join('\n')}`
  })()

  const fewShotBlock = buildFewShotBlock(input.fewShotExamples ?? [])

  // Build strategy block if available — this is the distilled context approach
  const strategyBlock = input.strategy
    ? strategyToPromptBlock(input.strategy)
    : ''

  return [
    `Message kind: ${messageKind(input)}`,
    '',
    strategyBlock,
    strategyBlock ? '' : null,
    factsBlock,
    '',
    playBlock,
    '',
    roleBlock,
    '',
    proofBlock,
    '',
    fewShotBlock,
    '',
    historyBlock,
    '',
    profileBlock,
    '',
    leadBlock,
    '',
    input.conversationContext ?? '',
    input.conversationContext ? '' : null,
    opts?.asPlainText
      ? 'End the draft, then put ---SELFCHECK--- on its own line and the self-check JSON object after it, exactly as the system message describes. The draft itself is only the message text.'
      : 'Return the JSON object described in the system message.',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * Generate an outreach draft for a lead using conditional single-generation.
 *
 * Pipeline: LongCat → deterministic quality gate → PASS: return immediately.
 * On FAIL: second candidate (Groq strong or corrective retry) → GPT escalation.
 *
 * GPT is NOT a normal pipeline stage. Target: <5% of generations reach GPT.
 */
export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  if (input.type === 'reply' && !input.conversationContext) {
    throw new Error(
      'Reply drafting needs the prospect reply text, which is not captured yet.',
    )
  }

  const verdict = input.score.verdict
  if (verdict === 'skip') {
    throw new Error(
      'This lead scored skip. Drafting is only allowed for send and research_more leads.',
    )
  }

  if (input.type !== 'reply' && !signalEvidenceMatch(input.extracted.signalType, input.extracted.signalEvidence)) {
    throw new Error(
      `Signal type ${input.extracted.signalType} is not supported by its evidence ("${input.extracted.signalEvidence}"). Rescore this lead before drafting.`,
    )
  }

  const userPrompt = buildUserPrompt(input)
  const systemPrompt = baseDraftSystem(input.styleCard, input.facts)

  if (!hasProvider()) {
    return demoDraft(input, userPrompt)
  }

  const callLog: DraftCallLog[] = []
  const isHighValue = input.score.total >= 10

  // Attempt 1: LongCat (primary writer)
  const longcatChain = buildLongcatDraftChain()
  const resultA = await runDraftAttemptWithFallback(longcatChain, 'longcat', systemPrompt, userPrompt, callLog)
    .catch(() => null)

  if (resultA?.passed) {
    const draft = finishDraft(input, resultA, [resultA.hostLabel], 1, callLog)
    return {
      ...draft,
      pickReason: 'LongCat passed quality gates on first attempt.',
      fewShotReason: fewShotLabel(input.fewShotExamples),
      escalationReason: undefined,
    }
  }

  // Attempt 2: corrective retry with Groq (feedback from first failure)
  const escalationDecision = shouldEscalateToPremium({
    primaryPassed: resultA?.passed ?? false,
    primaryScore: resultA ? variantScore(resultA) : 0,
    isHighValue,
    malformedOutput: !resultA,
    attemptCount: callLog.length,
  })

  if (escalationDecision.shouldEscalate || isHighValue) {
    const feedback = resultA ? buildCorrectiveFeedback(resultA, input) : null
    const secondChain = pickDraftChain()
    const resultB = await runDraftAttemptWithFallback(
      secondChain,
      'groq-retry',
      systemPrompt,
      feedback ? `${userPrompt}\n\n${feedback}` : userPrompt,
      callLog,
    ).catch(() => null)

    if (resultB?.passed) {
      const modelsUsed = [resultA?.hostLabel, resultB.hostLabel].filter((x): x is string => Boolean(x))
      const draft = finishDraft(input, resultB, modelsUsed, 2, callLog)
      return {
        ...draft,
        variant: resultA ? { draftText: resultA.output.draft, selfCheck: { test1ReplyOrDelete: Boolean(resultA.output.test_1_reply_or_delete), test1Note: resultA.output.test_1_note || '', test2NotGeneric: Boolean(resultA.output.test_2_not_generic), test2Note: resultA.output.test_2_note || '', codeChecks: resultA.codeChecks }, passed: resultA.passed } : undefined,
        pickReason: resultA ? 'LongCat failed; Groq corrective retry passed.' : 'LongCat unavailable; Groq succeeded.',
        fewShotReason: fewShotLabel(input.fewShotExamples),
        escalationReason: escalationDecision.reason,
      }
    }

    // Attempt 3: GPT escalation only
    const openaiChain = buildOpenaiDraftChain()
    if (openaiChain.length > 0 && escalationDecision.shouldEscalate) {
      const lastAttempt = resultB ?? resultA
      const gptFeedback = lastAttempt ? buildCorrectiveFeedback(lastAttempt, input) : null
      const gptResult = await runDraftAttemptWithFallback(
        openaiChain,
        'gpt-escalation',
        systemPrompt,
        gptFeedback ? `${userPrompt}\n\n${gptFeedback}` : userPrompt,
        callLog,
      ).catch(() => null)

      if (gptResult) {
        const modelsUsed = [resultA?.hostLabel, resultB?.hostLabel, gptResult.hostLabel].filter((x): x is string => Boolean(x))
        const draft = finishDraft(input, gptResult, modelsUsed, 3, callLog)
        return {
          ...draft,
          variant: resultA ? { draftText: resultA.output.draft, selfCheck: { test1ReplyOrDelete: Boolean(resultA.output.test_1_reply_or_delete), test1Note: resultA.output.test_1_note || '', test2NotGeneric: Boolean(resultA.output.test_2_not_generic), test2Note: resultA.output.test_2_note || '', codeChecks: resultA.codeChecks }, passed: resultA.passed } : undefined,
          pickReason: 'Escalated to GPT: cheaper tiers failed quality gates.',
          fewShotReason: fewShotLabel(input.fewShotExamples),
          escalationReason: escalationDecision.reason,
        }
      }
    }
  }

  // Return best effort (even if not passing)
  const best = resultA
  if (!best) {
    const draft = finishDraft(input, emptyResult('all-failed'), ['all-failed'], callLog.length, callLog)
    return {
      ...draft,
      pickReason: 'All model attempts failed; returning best effort.',
      fewShotReason: fewShotLabel(input.fewShotExamples),
      escalationReason: escalationDecision.reason,
    }
  }

  const draft = finishDraft(input, best, [best.hostLabel], callLog.length, callLog)
  return {
    ...draft,
    pickReason: 'Best effort from available providers.',
    fewShotReason: fewShotLabel(input.fewShotExamples),
    escalationReason: escalationDecision.reason,
  }
}



/** Run a single draft attempt with per-side fallback built into the chain. */
async function runDraftAttemptWithFallback(
  chain: ChainStep[],
  label: string,
  system: string,
  userPrompt: string,
  callLog: DraftCallLog[],
): Promise<ReturnType<typeof runDraftAttempt> | null> {
  if (chain.length === 0) return null
  return runDraftAttempt(chain, system, userPrompt, callLog)
}

/** Empty result used when a candidate completely fails. */
function emptyResult(hostLabel: string): { output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks']; hostLabel: string } {
  return {
    output: { draft: '', test_1_reply_or_delete: false, test_1_note: 'Candidate failed.', test_2_not_generic: false, test_2_note: 'Candidate failed.' },
    passed: false,
    codeChecks: { companyMentioned: false, specificEvidenceMentioned: false },
    hostLabel,
  }
}

function fewShotLabel(examples?: { company: string }[]): string {
  return examples && examples.length > 0
    ? `Informed by ${examples.length} real win(s): ${examples.map((e) => e.company).join(', ')}.`
    : 'No few-shot examples matched this lead.'
}

/**
 * Returns true if the evidence text actually supports the claimed signal type.
 * This is the hard gate that prevents drafting around a false signal premise —
 * e.g. signalType=1 (hiring) with evidence that says nothing about hiring.
 */
function signalEvidenceMatch(signalType: number | null, evidence: string | null): boolean {
  if (!evidence || evidence.trim().length < 12) return false
  const e = evidence.toLowerCase()
  switch (signalType) {
    case 1: return /\bhiring\b|\bopen role\b|\bjoining\b|\bwe'?re growing\b|\bscaling the team\b|\bnew position\b/i.test(e)
    case 2: return /\bsolo\b|\bone[- ]person\b|\btiny team\b|\bjust me\b|\bfounder\b.*\balone\b/i.test(e)
    case 3: return /\braised\b|\bseed\b|\bseries [abc]\b|\bfunding\b|\binvestment\b|\bbacked by\b/i.test(e)
    case 4: return /\blast update\b|\boutdated\b|\bstale\b|\babandoned\b|\bno update\b|\bdormant\b/i.test(e)
    case 5: return /\blegacy\b|\bwordpress\b|\bjquery\b|\bunsupported\b|\bdeprecated\b|\baging\b/i.test(e)
    case 6: return /\bbehind\b|\bdelayed\b|\boverdue\b|\bstuck\b|\bslow\b|\bpain\b|\bfrustrat\b/i.test(e)
    case 7: return /\blooking for\b|\bneed help\b|\bopen to\b|\bagency\b|\bfreelancer\b|\bseeking\b/i.test(e)
    default: return false
  }
}

function variantScore(v: { passed: boolean; output: DraftModelOutput; codeChecks: SelfCheck['codeChecks'] }): number {
  let s = 0
  if (v.passed) s += 4
  if (v.output.test_1_reply_or_delete) s += 2
  if (v.output.test_2_not_generic) s += 2
  if (v.codeChecks.companyMentioned) s += 1
  if (v.codeChecks.specificEvidenceMentioned) s += 1
  return s
}

function pickBestVariant(
  a: { output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks']; hostLabel: string },
  b: { output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks']; hostLabel: string },
): {
  primary: typeof a
  secondary: typeof a | null
  pickReason: string
} {
  const sa = variantScore(a)
  const sb = variantScore(b)

  if (sa >= sb) {
    return {
      primary: a,
      secondary: b,
      pickReason:
        sa === sb
          ? 'Both variants scored the same. Variant A is shown by default.'
          : 'Variant A scored higher on self-check + code checks.',
    }
  }

  return {
    primary: b,
    secondary: a,
    pickReason: 'Variant B scored higher on self-check + code checks.',
  }
}

async function runDraftAttempt(
  chain: ReturnType<typeof pickDraftChain>,
  system: string,
  userPrompt: string,
  callLog: DraftCallLog[],
): Promise<{ output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks']; hostLabel: string }> {
  // json_object mode only, never strict schema — same reasoning as
  // extraction: DeepSeek's own strict mode has an open bug returning
  // malformed JSON on some calls, so this app never trusts a provider's
  // schema-adherence claim. The code-level checks below are the real gate,
  // applied identically regardless of which tier answered.
  const result = await structuredJsonChain<DraftModelOutput>(chain, {
    system,
    user: userPrompt,
    schema: DRAFT_SCHEMA,
  })
  callLog.push({ costTier: result.costTier, host: result.host, estimatedCostUsd: result.estimatedCostUsd })
  const output = result.data
  const hostLabel = `${result.costTier}:${result.host}`

  const cleaned = (output.draft ?? '').trim()
  if (!cleaned) {
    return {
      output: { ...output, draft: '' },
      passed: false,
      codeChecks: { companyMentioned: false, specificEvidenceMentioned: false },
      hostLabel,
    }
  }

  const codeChecks = deterministicChecks(cleaned, {
    company: extractCompanyFromUserPrompt(userPrompt),
    evidence: extractEvidenceFromUserPrompt(userPrompt),
  })

  const passed = Boolean(
    output.test_1_reply_or_delete &&
      output.test_2_not_generic &&
      codeChecks.companyMentioned &&
      codeChecks.specificEvidenceMentioned,
  )

  return { output: { ...output, draft: cleaned }, passed, codeChecks, hostLabel }
}

function finishDraft(
  input: DraftInput,
  result: { output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks'] },
  modelsUsed: string[],
  attempts: number,
  callLog: DraftCallLog[],
): DraftResult {
  const sanitized = sanitizeDraft(result.output.draft, input.facts)
  const passed = result.passed && sanitized.strippedNumbers.length === 0 && !sanitized.requestedCall

  return {
    leadId: input.leadId,
    type: input.type,
    draftText: sanitized.text,
    selfCheck: {
      test1ReplyOrDelete: Boolean(result.output.test_1_reply_or_delete),
      test1Note: result.output.test_1_note || '',
      test2NotGeneric: Boolean(result.output.test_2_not_generic),
      test2Note: result.output.test_2_note || '',
      codeChecks: result.codeChecks,
    },
    passed,
    modelUsed: modelsUsed.join(' then '),
    attempts: attempts,
    strippedNumbers: sanitized.strippedNumbers,
    hadEmDash: sanitized.hadEmDash,
    hadExclamation: sanitized.hadExclamation,
    requestedCall: sanitized.requestedCall,
    callLog,
  }
}

/**
 * Builds a corrective-feedback block naming exactly what failed on the
 * rejected attempt, so a retry fixes the actual problem instead of just
 * re-rolling the dice on the same prompt. Returns null when nothing
 * specific can be said (the draft came back empty, so there's nothing to
 * diagnose beyond "try again").
 */
export function buildCorrectiveFeedback(
  attempt: { output: DraftModelOutput; codeChecks: SelfCheck['codeChecks'] },
  input: DraftInput,
): string | null {
  const problems: string[] = []
  if (!attempt.codeChecks.companyMentioned) {
    problems.push(`- It never named "${input.lead.company}". Write the company name into the first or second line.`)
  }
  if (!attempt.codeChecks.specificEvidenceMentioned) {
    problems.push(
      `- It dropped the specific evidence ("${input.extracted.signalEvidence || 'the signal noted for this lead'}"). Lead with that exact detail, not a generic version of it.`,
    )
  }
  if (!attempt.output.test_1_reply_or_delete) {
    problems.push(`- Its own test 1 failed: ${attempt.output.test_1_note || 'not specific enough to earn a reply.'} Make it worth 30 seconds of their time.`)
  }
  if (!attempt.output.test_2_not_generic) {
    problems.push(`- Its own test 2 failed: ${attempt.output.test_2_note || 'would survive a company swap.'} Tie it to something only this company/signal has.`)
  }

  if (problems.length === 0) return null

  return [
    'CORRECTIVE FEEDBACK — your previous attempt failed its own checks. Do not repeat these mistakes:',
    ...problems,
    'Write a new draft that fixes all of the above. Run both tests honestly again before returning it.',
  ].join('\n')
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
 * DEMO ONLY. Deterministic draft used when no API key is set. Reuses the real
 * play and facts pipeline so the loop runs end to end locally.
 */
function demoDraft(input: DraftInput, userPrompt: string): DraftResult {
  void userPrompt
  const signal = signalById(input.extracted.signalType)
  const play = pickPlayForSignal(input.plays, input.extracted.signalType)
  const factsTable = filterFacts(input.facts)
  const priceFact = factsTable.find((f) => f.factType === 'price')
  const lastSent = (input.history ?? [])
    .filter((m) => m.sentText && m.sentAt)
    .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
    .at(-1)

  const opener =
    input.extracted.name ?? input.lead.company
  const body =
    input.type === 'followup'
      ? `Wanted to make sure my last note made sense. ${lastSent ? 'Short version: ' + lastSent.sentText : ''} Happy to drop the idea if the timing is wrong.`
      : signal && input.extracted.signalEvidence
        ? `I noticed ${input.extracted.signalEvidence}`
        : 'I noticed what you are building with your team'
  const priceLine = priceFact ? `\n\n${priceFact.label}: ${priceFact.value}` : ''
  const close = play ? play.templateShape : ''

  const draft = [
    `${input.styleCard?.greeting ?? 'Hey'} ${opener},`,
    '',
    body,
    `${input.lead.company} looks like a strong fit for how I help teams ship faster. Happy to send over a free Read, a quick written take on what I'm seeing.${priceLine}`,
    close,
    input.styleCard?.sign_off ?? '',
  ]
    .filter(Boolean)
    .join('\n')

  const sanitized = sanitizeDraft(draft, input.facts)

  return {
    leadId: input.leadId,
    type: input.type,
    draftText: sanitized.text,
    selfCheck: {
      test1ReplyOrDelete: true,
      test1Note: 'DEMO self-check: draft references a specific detail from the lead.',
      test2NotGeneric: true,
      test2Note: 'DEMO self-check: company and signal detail are embedded.',
      codeChecks: {
        companyMentioned: draft.toLowerCase().includes(input.lead.company.toLowerCase()),
        specificEvidenceMentioned: true,
      },
    },
    passed: sanitized.strippedNumbers.length === 0 && !sanitized.requestedCall,
    modelUsed: 'demo-local-deterministic',
    attempts: 1,
    strippedNumbers: sanitized.strippedNumbers,
    hadEmDash: sanitized.hadEmDash,
    hadExclamation: sanitized.hadExclamation,
    requestedCall: sanitized.requestedCall,
    callLog: [],
  }
}

/**
 * Only the facts relevant to this call go into the prompt, never the whole
 * table. Credentials, prices, and case facts are the drafting set; anything
 * tagged for a specific industry or play is included only when it matches
 * this lead's situation.
 */
function filterFacts(facts: Fact[]): Fact[] {
  const always = facts.filter((f) =>
    ['credential', 'price', 'case'].includes(f.factType ?? ''),
  )
  const situation = facts.filter(
    (f) => f.factType?.startsWith('industry:') || f.factType?.startsWith('play:'),
  )
  return [...always, ...situation].slice(0, 14)
}

function extractCompanyFromUserPrompt(prompt: string): string | null {
  const m = prompt.match(/Company: (.+)/)
  return m?.[1]?.trim() ?? null
}

function extractEvidenceFromUserPrompt(prompt: string): string | null {
  const m = prompt.match(/Evidence: (.+)/)
  return m?.[1]?.trim() ?? null
}
