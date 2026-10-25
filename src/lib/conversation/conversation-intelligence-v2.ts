/**
 * Conversation intelligence V2.
 *
 * `intent.ts` is the terminal/decline authority (being wrong is expensive).
 * This module is the richer, multi-signal layer for sales stages: one message
 * can carry PRICING *and* MEETING_REQUEST, and each signal maps to one next
 * action. It never overrides the terminal authority — it extends it.
 */

export type ConversationSignal =
  | 'POSITIVE_INTEREST'
  | 'QUESTION'
  | 'PRICING'
  | 'BUDGET_DISCLOSED'
  | 'MEETING_REQUEST'
  | 'PROPOSAL_REQUEST'
  | 'PROCUREMENT'
  | 'NDA'
  | 'OBJECTION'
  | 'DEFERRED'
  | 'NEGATIVE'
  | 'DO_NOT_CONTACT'
  | 'WON'
  | 'LOST'

const DO_NOT_CONTACT = /\b(?:stop\s+(?:messaging|contacting|emailing)|do\s+not\s+(?:contact|message|email|send|dm)|don'?t\s+(?:contact|message|email)|no\s+(?:more|further|additional)\s+(?:messages?|emails?|dms?|follow[- ]?ups?)|unsubscribe|remove\s+me|not\s+interested\s+in\s+(?:being\s+)?contacted)\b/i

const WON = /\b(?:you(?:'re| are) hired|welcome aboard|let'?s\s+(?:sign|get started|kick ?off)|contract(?:'s| is)? signed|signed the contract|ready to start|when can you start)\b/i
const PROPOSAL_REQUEST = /\b(?:send\s+(?:me\s+|us\s+|over\s+)*(?:a\s+|the\s+|your\s+)?proposal|proposal|scope of work|statement of work|sow)\b/i
const NDA = /\b(?:nda|non[- ]disclosure|sign the (?:nda|agreement)|confidentiality agreement)\b/i
const PRICING = /\b(?:how much|pricing|price|cost|what(?:'s| is| are) your (?:rate|rates|fee|fees|price)|your rates?|hourly rate|quote)\b/i
const BUDGET_DISCLOSED = /\b(?:budget(?:\s+is)?\s+(?:is\s+)?(?:around|about|roughly)?\s*[\$€£]?\s*\d[\d,]*|we(?:'re| are) (?:spending|allocating|budgeting)|we can spend|approved budget|[\$€£]\s?\d[\d,]*\s*(?:k|m)?\s*(?:budget|for this|to spend))/i
const MEETING_REQUEST = /\b(?:book|schedule|discovery call|(?:a |quick )?call|zoom|meeting|let'?s (?:talk|meet|chat)|available (?:on|this|next|tomorrow)|calendly|15[- ]?min|20[- ]?min)\b/i
const PROCUREMENT = /\b(?:procurement|vendor (?:onboarding|approval|process)|purchase order|\bpo\b|security review|legal review|compliance review)\b/i
const OBJECTION = /\b(?:too (?:expensive|much|early|soon)|not the right (?:time|fit)|concerned about|worried about|need to think|hesitant|doesn'?t (?:feel|seem) right)\b/i
const DEFERRED = /\b(?:not (?:right )?now|maybe later|next (?:quarter|year|month)|circle back|check back|reach out (?:again )?(?:later|next)|follow up (?:later|next)|bad timing|too busy|after (?:q[1-4]|the holidays)|low priority)\b/i
const POSITIVE = /\b(?:interested|sounds (?:good|great|interesting)|let'?s (?:do it|go|proceed|connect)|keen|happy to|would love to|yes,? please|go ahead|tell me more|open to|send (?:me |over |us )?(?:the |your )?(?:details|more|info|information|portfolio|deck|rates?|case stud(?:y|ies)|examples?))\b/i
const NEGATIVE = /\b(?:not interested|no thanks|thanks but no|not a fit|wrong person|not looking|we'?re not hiring|we'?ve handled it internally|project (?:is )?completed|position (?:is )?filled|already (?:selected|chosen) someone)\b/i

const SIGNAL_PATTERNS: Array<{ signal: ConversationSignal; pattern: RegExp }> = [
  { signal: 'DO_NOT_CONTACT', pattern: DO_NOT_CONTACT },
  { signal: 'WON', pattern: WON },
  { signal: 'NEGATIVE', pattern: NEGATIVE },
  { signal: 'LOST', pattern: NEGATIVE },
  { signal: 'DEFERRED', pattern: DEFERRED },
  { signal: 'OBJECTION', pattern: OBJECTION },
  { signal: 'PROPOSAL_REQUEST', pattern: PROPOSAL_REQUEST },
  { signal: 'NDA', pattern: NDA },
  { signal: 'PROCUREMENT', pattern: PROCUREMENT },
  { signal: 'BUDGET_DISCLOSED', pattern: BUDGET_DISCLOSED },
  { signal: 'PRICING', pattern: PRICING },
  { signal: 'MEETING_REQUEST', pattern: MEETING_REQUEST },
  { signal: 'POSITIVE_INTEREST', pattern: POSITIVE },
]

/**
 * Every signal a single client message carries. Order is stable and
 * deterministic; a message can produce several (PRICING + MEETING_REQUEST).
 */
export function classifyConversationSignals(text: string): ConversationSignal[] {
  const t = text.trim()
  if (!t) return []
  const out = new Set<ConversationSignal>()
  for (const { signal, pattern } of SIGNAL_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(t)) out.add(signal)
  }
  if (out.size === 0) {
    if (/\?/.test(t)) out.add('QUESTION')
    else out.add('POSITIVE_INTEREST')
  }
  // NEGATIVE and LOST share a pattern; keep NEGATIVE unless it is a hard no.
  if (out.has('NEGATIVE') && out.has('LOST')) out.delete('LOST')
  return [...out]
}

export type ConversationNextAction =
  | 'TERMINAL'
  | 'CLOSE'
  | 'PREPARE_PROPOSAL'
  | 'REVIEW_NDA'
  | 'SCHEDULE_MEETING'
  | 'ANSWER_PRICING'
  | 'QUALIFY_SCOPE'
  | 'PROCUREMENT_STEP'
  | 'HANDLE_OBJECTION'
  | 'SCHEDULE_FOLLOWUP'
  | 'CONTINUE'
  | 'ANSWER_QUESTION'
  | 'WAIT'

export interface ConversationNextActionResult {
  action: ConversationNextAction
  signals: ConversationSignal[]
  primarySignal: ConversationSignal | null
  reason: string
}

const ACTION_BY_SIGNAL: Record<ConversationSignal, ConversationNextAction> = {
  DO_NOT_CONTACT: 'TERMINAL',
  WON: 'CONTINUE',
  LOST: 'CLOSE',
  NEGATIVE: 'CLOSE',
  PROPOSAL_REQUEST: 'PREPARE_PROPOSAL',
  NDA: 'REVIEW_NDA',
  MEETING_REQUEST: 'SCHEDULE_MEETING',
  PRICING: 'ANSWER_PRICING',
  BUDGET_DISCLOSED: 'QUALIFY_SCOPE',
  PROCUREMENT: 'PROCUREMENT_STEP',
  OBJECTION: 'HANDLE_OBJECTION',
  DEFERRED: 'SCHEDULE_FOLLOWUP',
  POSITIVE_INTEREST: 'CONTINUE',
  QUESTION: 'ANSWER_QUESTION',
}

/**
 * One next action from the conversation. A terminal signal wins; otherwise the
 * most commercially advanced signal decides (proposal > meeting > pricing).
 */
export function resolveConversationNextAction(
  signals: ConversationSignal[],
): ConversationNextActionResult {
  const unique = [...new Set(signals)]
  if (unique.includes('DO_NOT_CONTACT')) {
    return { action: 'TERMINAL', signals: unique, primarySignal: 'DO_NOT_CONTACT', reason: 'The client opted out. Close the thread.' }
  }
  if (unique.includes('WON')) {
    return { action: 'CONTINUE', signals: unique, primarySignal: 'WON', reason: 'The client is ready to start. Move to onboarding.' }
  }
  const order: ConversationSignal[] = [
    'PROPOSAL_REQUEST', 'NDA', 'MEETING_REQUEST', 'PRICING', 'BUDGET_DISCLOSED',
    'PROCUREMENT', 'OBJECTION', 'DEFERRED', 'NEGATIVE', 'LOST', 'POSITIVE_INTEREST', 'QUESTION',
  ]
  const primary = order.find((s) => unique.includes(s)) ?? null
  if (!primary) {
    return { action: 'WAIT', signals: unique, primarySignal: null, reason: 'No clear signal.' }
  }
  return {
    action: ACTION_BY_SIGNAL[primary],
    signals: unique,
    primarySignal: primary,
    reason: `${primary.replace(/_/g, ' ').toLowerCase()} is the next step.`,
  }
}

export interface ConversationFact {
  kind: 'budget' | 'meeting_date' | 'deliverable' | 'timeline' | 'decision_maker' | 'procurement_step' | 'nda' | 'proposal_request' | 'objection' | 'deferral_date'
  value: string
  /** The inbound message this fact came from. */
  sourceMessageId: string | null
  /** The verbatim quote that supports the fact. */
  quote: string
  confidence: 'high' | 'medium' | 'low'
  capturedAt: string
}

const FACT_PATTERNS: Array<{ kind: ConversationFact['kind']; pattern: RegExp; group?: number }> = [
  { kind: 'budget', pattern: /(?:budget(?:\s+is)?\s+(?:is\s+)?(?:around|about|roughly)?|we(?:'re| are) (?:spending|allocating|budgeting)|we can spend|approved budget)\s*[\$€£]?\s*(\d[\d,]*\s*(?:k|m)?)/i, group: 1 },
  { kind: 'meeting_date', pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|this week|calendly(?:\.com\/\S+)?)/i, group: 1 },
  { kind: 'nda', pattern: /\b(nda|non[- ]disclosure agreement)\b/i, group: 1 },
  { kind: 'proposal_request', pattern: /\b(proposal|scope of work|statement of work|sow)\b/i, group: 1 },
  { kind: 'procurement_step', pattern: /\b(procurement|vendor (?:onboarding|approval|process)|purchase order|security review|legal review)\b/i, group: 1 },
  { kind: 'deferral_date', pattern: /\b(next (?:quarter|year|month)|after (?:q[1-4]|the holidays)|in a (?:few|couple of) months|later this (?:year|quarter))\b/i, group: 1 },
]

/**
 * Extract stated facts from one inbound message so a $30k budget or a Thursday
 * meeting is not trapped in the message body.
 */
export function extractConversationFacts(
  text: string,
  sourceMessageId: string | null,
  capturedAt: string = new Date().toISOString(),
): ConversationFact[] {
  const t = text.trim()
  if (!t) return []
  const facts: ConversationFact[] = []
  for (const { kind, pattern, group } of FACT_PATTERNS) {
    pattern.lastIndex = 0
    const m = t.match(pattern)
    if (!m) continue
    const value = group && m[group] ? m[group].trim() : m[0].trim()
    if (!value) continue
    facts.push({
      kind,
      value,
      sourceMessageId,
      quote: t.length > 120 ? `${t.slice(0, 119)}…` : t,
      confidence: kind === 'budget' ? 'high' : 'medium',
      capturedAt,
    })
  }
  return facts
}
