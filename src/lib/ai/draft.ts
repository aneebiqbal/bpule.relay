import type {
  ExtractedLead,
  Fact,
  Lead,
  Message,
  Play,
  Profile,
  ProofItem,
  ScoreResult,
  StyleCard,
} from '@/lib/domain/types'
import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJson } from '@/lib/ai/provider'
import { injectStyleCard } from '@/lib/style/inject'
import { signalById } from '@/lib/score/signals'
import { pickPlayForSignal } from '@/lib/score/plays'
import { sanitizeDraft, siteIsLive } from '@/lib/facts/sanitize'

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
  /** The second variant, when best-of-two drafting is enabled. */
  variant?: DraftVariant
  /** Why the primary draft was picked over the variant. */
  pickReason?: string
  /** Which few-shot examples informed this draft. */
  fewShotReason?: string
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
    ? 'The public site is live. A CTA may reference it.'
    : 'The public site is NOT live yet. Every call to action must land in a reply to this message or a free Read offer. Never link to a website that does not exist. If no relevant past project is provided, do not invent one. Reference a matched proof item only when one is listed.'
  const testsBlock = opts?.asPlainText
    ? `Write the draft, then on the line after it write the marker ---SELFCHECK--- followed by ONLY this single JSON object:
{"test_1_reply_or_delete": true or false, "test_1_note": "one sentence", "test_2_not_generic": true or false, "test_2_note": "one sentence"}

Test 1: Would a senior engineer at the target company reply to this, or delete it? Pass only if they would reply.
Test 2: Could this draft be sent to a different company unchanged? Pass only if it is tied to this company's specific signal and would not survive a company swap.

Write the draft first, then honestly run the tests on it, then the marker and the JSON. Do not weaken the tests to make them pass. No commentary before the draft or after the JSON.`
    : TWO_TESTS
  return [
    'You write cold outreach messages for a sales rep at a software delivery agency. The message is copy-pasted by a human; you never send anything yourself.',
    'Claim ONLY facts listed in the facts table. A number that is not in the facts table must not appear in the draft. If you are unsure, leave the number out.',
    'Never fabricate a project, client, result, or credential. Never invent metrics.',
    'When the message lists a matched past project, reference it specifically; that referencing is the personalization. Without a matched project, stay with the signal, never invent a case.',
    'Rule on client names: a client may only be named when the matched proof item explicitly says permission is on file. Otherwise describe the project by shape (a trading dashboard, an internal QA tool) and never name the client.',
    "Voice rule: the sender is ONE person. Write in first person singular. Never use 'we', 'our', or 'us' for the sender. Never mention a team, a headcount, or anyone else doing the work. A client's quoted words may keep their own 'we'.",
    'Do not use em dashes anywhere in the draft. Write plain sentences in the sender\'s voice.',
    'Keep the message short enough for a first cold message: a greeting, a specific reason for reaching out based on their signal, one relevant fact or question, and a close.',
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

  return [
    `Message kind: ${messageKind(input)}`,
    '',
    factsBlock,
    '',
    playBlock,
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
    opts?.asPlainText
      ? 'End the draft, then put ---SELFCHECK--- on its own line and the self-check JSON object after it, exactly as the system message describes. The draft itself is only the message text.'
      : 'Return the JSON object described in the system message.',
  ].join('\n')
}

/**
 * Generate an outreach draft for a lead: one model call that drafts AND
 * self-checks against the two fixed tests. If a test fails on the first
 * attempt, the call is retried once on the strong model. This is the only
 * per-lead spend in the pipeline.
 */
export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  if (input.type === 'reply') {
    // TODO(followup-reply): inbound reply text is not captured yet, so a
    // reply draft would have nothing to respond to. Route and schema are
    // scaffolded; the logic lands with inbound capture.
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

  const userPrompt = buildUserPrompt(input)
  const systemPrompt = baseDraftSystem(input.styleCard, input.facts)

  if (!hasProvider()) {
    return demoDraft(input, userPrompt)
  }

  // Best-of-two: generate two variants in parallel on the cheap model,
  // self-check both, and return the stronger one as primary with the other
  // as a variant. This catches the cases where the first draft is mediocre
  // without paying for a bigger model.
  const cheap = pickModel('draft-variant')
  const [variantA, variantB] = await Promise.all([
    runDraftAttempt(cheap.model, systemPrompt, userPrompt),
    runDraftAttempt(cheap.model, systemPrompt, userPrompt),
  ])

  const { primary, secondary, pickReason } = pickBestVariant(variantA, variantB)

  const draft = finishDraft(input, primary, [cheap.model], 1)
  const second: DraftVariant | undefined = secondary
    ? {
        draftText: secondary.output.draft,
        selfCheck: {
          test1ReplyOrDelete: Boolean(secondary.output.test_1_reply_or_delete),
          test1Note: secondary.output.test_1_note || '',
          test2NotGeneric: Boolean(secondary.output.test_2_not_generic),
          test2Note: secondary.output.test_2_note || '',
          codeChecks: secondary.codeChecks,
        },
        passed: secondary.passed,
      }
    : undefined

  return {
    ...draft,
    variant: second,
    pickReason,
    fewShotReason:
      input.fewShotExamples && input.fewShotExamples.length > 0
        ? `Informed by ${input.fewShotExamples.length} real win(s): ${input.fewShotExamples.map((e) => e.company).join(', ')}.`
        : 'No few-shot examples matched this lead.',
  }
}

function pickBestVariant(
  a: { output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks'] },
  b: { output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks'] },
): {
  primary: typeof a
  secondary: typeof a | null
  pickReason: string
} {
  const score = (v: typeof a) => {
    let s = 0
    if (v.passed) s += 4
    if (v.output.test_1_reply_or_delete) s += 2
    if (v.output.test_2_not_generic) s += 2
    if (v.codeChecks.companyMentioned) s += 1
    if (v.codeChecks.specificEvidenceMentioned) s += 1
    return s
  }

  const sa = score(a)
  const sb = score(b)

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
  model: string,
  system: string,
  userPrompt: string,
): Promise<{ output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks'] }> {
  const output = await structuredJson<DraftModelOutput>({
    model,
    system,
    user: userPrompt,
    schema: DRAFT_SCHEMA,
  })

  const cleaned = (output.draft ?? '').trim()
  if (!cleaned) {
    return {
      output: { ...output, draft: '' },
      passed: false,
      codeChecks: { companyMentioned: false, specificEvidenceMentioned: false },
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

  return { output: { ...output, draft: cleaned }, passed, codeChecks }
}

function finishDraft(
  input: DraftInput,
  result: { output: DraftModelOutput; passed: boolean; codeChecks: SelfCheck['codeChecks'] },
  modelsUsed: string[],
  attempts: number,
): DraftResult {
  const sanitized = sanitizeDraft(result.output.draft, input.facts)
  const passed = result.passed && sanitized.strippedNumbers.length === 0

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
    `${input.lead.company} looks like a strong fit for how I help teams ship faster, and I wanted to see if a quick intro call makes sense.${priceLine}`,
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
    passed: sanitized.strippedNumbers.length === 0,
    modelUsed: 'demo-local-deterministic',
    attempts: 1,
    strippedNumbers: sanitized.strippedNumbers,
    hadEmDash: sanitized.hadEmDash,
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