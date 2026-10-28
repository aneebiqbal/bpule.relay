/**
 * Explicit buyer questions — the keyword gate's public surface.
 *
 * This is an ADAPTER over the canonical structured layer in
 * `buyer-request-plan.ts`. The taxonomy, answerability and coverage all live
 * there; this file keeps the two legacy callers (`draft.ts`, `draft-stream.ts`)
 * stable while guaranteeing there is no second implementation to drift.
 */

import {
  assessReplyPlan,
  buildReplyPlan,
  extractBuyerRequests,
  hasInventedAvailability,
  type BuyerRequest,
  type BuyerRequestType,
} from './buyer-request-plan'

export { hasInventedAvailability }

export type BuyerQuestionTopic =
  | 'experience'
  | 'timeline'
  | 'availability'
  | 'pricing'
  | 'process'
  | 'team'
  | 'tech_stack'
  | 'other'

export type BuyerQuestionStatus = 'ANSWERED' | 'ASK_CLARIFICATION' | 'NEEDS_VERIFICATION' | 'PENDING'

export interface BuyerQuestion {
  topic: BuyerQuestionTopic
  /** The question as the buyer asked it. */
  text: string
  status: BuyerQuestionStatus
  /** The canonical request behind this question; coverage is derived from it. */
  request?: BuyerRequest
}

/** Canonical request type → legacy display topic. */
const TOPIC_BY_TYPE: Record<BuyerRequestType, BuyerQuestionTopic> = {
  EXPERIENCE: 'experience',
  CASE_STUDY: 'experience',
  REFERENCES: 'experience',
  DELIVERY_TIMELINE: 'timeline',
  ESTIMATE: 'pricing',
  START_DATE: 'availability',
  TEAM_AVAILABILITY: 'availability',
  MEETING_AVAILABILITY: 'availability',
  PRICING: 'pricing',
  BUDGET: 'pricing',
  RATE: 'pricing',
  TECHNICAL_APPROACH: 'process',
  SCOPE: 'process',
  PROPOSAL: 'process',
  TEAM_SIZE: 'team',
  SUPPORT: 'team',
  TECH_STACK: 'tech_stack',
  INTEGRATION: 'tech_stack',
  SECURITY: 'tech_stack',
  COMPLIANCE: 'tech_stack',
  NDA: 'tech_stack',
  LOCATION: 'other',
  TIMEZONE: 'other',
  NEXT_STEP: 'other',
}

/**
 * Every explicit question in a buyer message, with its topic. Deterministic —
 * the plan is built before generation and checked after.
 */
export function extractExplicitBuyerQuestions(replyText: string): BuyerQuestion[] {
  return extractBuyerRequests(replyText).map((request) => ({
    topic: TOPIC_BY_TYPE[request.type],
    text: request.quote,
    status: 'PENDING',
    request,
  }))
}

export interface QuestionCoverage {
  total: number
  answered: number
  /** answered + asked-for-clarification; the reply is complete at 100%. */
  covered: number
  /** covered / total, 0 when there are no questions. */
  ratio: number
  complete: boolean
  questions: BuyerQuestion[]
}

/**
 * Whether the draft addresses every explicit buyer question. Coverage is the
 * canonical reply-plan coverage, mapped back to the legacy status names.
 */
export function assessQuestionCoverage(questions: readonly BuyerQuestion[], draftText: string): QuestionCoverage {
  const requests = questions.map((q) => q.request).filter((r): r is BuyerRequest => Boolean(r))
  const result = assessReplyPlan(buildReplyPlan(requests), draftText)
  const statusOf = (request: BuyerRequest) =>
    result.coverage.find((c) => c.request === request)?.status ?? 'UNANSWERED'
  const toStatus = (status: string): BuyerQuestionStatus =>
    status === 'ANSWERED'
      ? 'ANSWERED'
      : status === 'UNANSWERED'
        ? 'NEEDS_VERIFICATION'
        : 'ASK_CLARIFICATION'

  const assessed = questions.map((q) =>
    q.request
      ? { ...q, status: toStatus(statusOf(q.request)) }
      : { ...q, status: 'NEEDS_VERIFICATION' as const },
  )
  const total = assessed.length
  const answered = assessed.filter((q) => q.status === 'ANSWERED').length
  const covered = assessed.filter((q) => q.status !== 'NEEDS_VERIFICATION').length
  const ratio = total === 0 ? 1 : covered / total
  return { total, answered, covered, ratio, complete: total === 0 || covered === total, questions: assessed }
}

/**
 * The prompt block that tells the generator exactly what to answer. Injected
 * only for replies.
 */
export function buildQuestionPlanBlock(questions: readonly BuyerQuestion[]): string {
  if (questions.length === 0) return ''
  const lines = questions.map((q, i) => {
    const unsafe = q.request?.answerability === 'UNSAFE_TO_INVENT' ? ' [DO NOT INVENT A DATE OR TIME]' : ''
    return `${i + 1}. [${q.topic}] ${q.text}${unsafe}`
  })
  return [
    'THE BUYER ASKED THESE EXPLICIT QUESTIONS. Answer every one of them in the reply. Do not skip any.',
    ...lines,
    'If you cannot answer one from the approved facts, say so and ask for what you need — never invent an answer.',
    'NEVER invent a calendar slot or a specific meeting time. If no calendar is available, offer to coordinate a time (for example "I can coordinate a time next week") instead of proposing a date.',
  ].join('\n')
}
