/**
 * Conversation Copilot - flagship OpenAI experience
 *
 * Pipeline:
 *   incoming message -> understand (interpretation) -> strategy -> reply (generation)
 *
 * Single recommended reply. Internal structured reasoning never exposed to user.
 * Deterministic code owns state transitions and canonical knowledge.
 * AI interprets and drafts. Human approves and sends.
 */

import { generate } from '@/lib/ai/runtime'
import { CONVERSATION_UNDERSTAND_SCHEMA, CONVERSATION_REPLY_SCHEMA } from '@/lib/ai/runtime/schemas'
import { getString, getStringArray, getBoolean } from '@/lib/ai/runtime/normalize'
import {
  buildConversationMemory,
  serializeMemoryForPrompt,
  type ConversationMemory,
} from './memory'
import type { CopilotUnderstandResult, CopilotReplyResult, CopilotResponse } from './types'
import type { Message } from '@/lib/domain/types'
import type { ConversationKnowledge } from '@/lib/relay/revenue-strategy'

const PROMPT_VERSION_UNDERSTAND = 'conversation-understand-v1'
const PROMPT_VERSION_REPLY = 'conversation-reply-v1'

// System prompts
const UNDERSTAND_SYSTEM = [
  "You are Relay's conversation intelligence. A prospect replied to an outgoing message.",
  'Your job: interpret what they mean, not what to say yet.',
  '',
  'You receive compact conversation memory (stage, objective, known facts, recent messages)',
  "and the prospect's latest message.",
  '',
  'Classify precisely. Do not invent facts. If evidence is missing, mark unknown.',
  'Be conservative: when in doubt, confidence=low.',
].join('\n')

const REPLY_SYSTEM = [
  "You are Relay's reply writer. You receive:",
  '- Conversation understanding (intent, sentiment, objective, missing context)',
  '- Compact conversation memory',
  '- The conversation goal and tone direction',
  '',
  'Write ONE recommended reply. Rules:',
  '- Never invent pricing, scope, or proof that is not in known facts',
  '- Answer their questions before anything else',
  '- Never restart a sales pitch - continue from where the conversation is',
  '- If they asked to meet, confirm logistics - do not re-pitch',
  '- If objection, address honestly - no fake empathy',
  '- Tone matches the direction given',
  '- Target 20-60 words unless context demands more',
  '- End with one clear next step only if it advances the conversation',
  '- Never use exclamation marks, never open with "Hope this finds you well" or "I noticed"',
  '',
  'Output the reply plus a brief goal and tone.',
].join('\n')

// Understand

export async function understandConversation(params: {
  incomingMessage: string
  memory: ConversationMemory
  contactName?: string | null
  leadCompany?: string
}): Promise<{ result: CopilotUnderstandResult; raw: Record<string, unknown> }> {
  const { incomingMessage, memory, contactName, leadCompany } = params
  const memoryText = serializeMemoryForPrompt(memory)

  const userPrompt = [
    `Contact: ${contactName ?? 'unknown'}`,
    `Company: ${leadCompany ?? 'unknown'}`,
    '',
    '## Conversation Memory',
    memoryText,
    '',
    "## Prospect's Latest Message",
    incomingMessage,
  ].join('\n')

  const { data } = await generate<CopilotUnderstandResult>({
    task: 'FAST_STRUCTURED',
    system: UNDERSTAND_SYSTEM,
    user: userPrompt,
    outputSchema: CONVERSATION_UNDERSTAND_SCHEMA,
    promptVersion: PROMPT_VERSION_UNDERSTAND,
    schemaName: PROMPT_VERSION_UNDERSTAND,
    feature: 'conversation_copilot',
    callSite: 'copilot:understand',
  })

  const raw = data as unknown as Record<string, unknown>
  return {
    result: {
      intent: normalizeIntent(getString(raw, 'intent')),
      sentiment: normalizeSentiment(getString(raw, 'sentiment')),
      questions: getStringArray(raw, 'questions'),
      objection: getString(raw, 'objection'),
      commercial_signal: getBoolean(raw, 'commercial_signal') ?? false,
      objective: getString(raw, 'objective') ?? 'continue conversation',
      missing_context: getStringArray(raw, 'missing_context'),
      relevant_evidence_ids: getStringArray(raw, 'relevant_evidence_ids'),
      knowledge_release: getStringArray(raw, 'knowledge_release'),
      confidence: normalizeConfidence(getString(raw, 'confidence')),
    },
    raw,
  }
}

// Reply

export async function draftReply(params: {
  understanding: CopilotUnderstandResult
  memory: ConversationMemory
  strategyDirection?: {
    goal: string
    tone: string
    cta: string
  }
  matchedProofIds?: string[]
}): Promise<CopilotReplyResult> {
  const { understanding, memory, strategyDirection, matchedProofIds } = params
  const memoryText = serializeMemoryForPrompt(memory)

  const userPrompt = [
    '## Understanding of Their Reply',
    `Intent: ${understanding.intent}`,
    `Sentiment: ${understanding.sentiment}`,
    `Confidence: ${understanding.confidence}`,
    `Objective: ${understanding.objective}`,
    `Commercial signal: ${understanding.commercial_signal}`,
    `Questions asked: ${understanding.questions.join(', ') || 'none'}`,
    `Objection: ${understanding.objection ?? 'none'}`,
    `Missing context: ${understanding.missing_context.join(', ') || 'none'}`,
    '',
    '## Conversation Memory',
    memoryText,
    '',
    '## Direction',
    `Goal: ${strategyDirection?.goal ?? understanding.objective}`,
    `Tone: ${strategyDirection?.tone ?? 'warm, direct, no pressure'}`,
    `CTA strategy: ${strategyDirection?.cta ?? 'one clear next step only if it advances the conversation'}`,
    matchedProofIds?.length ? `Relevant proof available: ${matchedProofIds.join(', ')}` : 'No specific proof matched - do not invent proof.',
  ].join('\n')

  const { data } = await generate<CopilotReplyResult>({
    task: 'INTERACTIVE_WRITING',
    system: REPLY_SYSTEM,
    user: userPrompt,
    outputSchema: CONVERSATION_REPLY_SCHEMA,
    promptVersion: PROMPT_VERSION_REPLY,
    schemaName: PROMPT_VERSION_REPLY,
    feature: 'conversation_copilot',
    callSite: 'copilot:reply',
    maxTokens: 512,
  })

  const raw = data as unknown as Record<string, unknown>
  return {
    recommended_reply: getString(raw, 'recommended_reply') ?? '',
    goal: getString(raw, 'goal') ?? understanding.objective,
    tone: getString(raw, 'tone') ?? 'warm, direct',
    cta_strategy: getString(raw, 'cta_strategy') ?? '',
  }
}

// One-shot orchestration

export async function runCopilot(params: {
  incomingMessage: string
  priorMessages: Message[]
  knowledge: ConversationKnowledge | null
  stage: string
  contactName?: string | null
  leadCompany?: string
}): Promise<CopilotResponse> {
  const memory = buildConversationMemory({
    stage: params.stage,
    knowledge: params.knowledge,
    priorMessages: params.priorMessages,
  })

  const { result: understanding } = await understandConversation({
    incomingMessage: params.incomingMessage,
    memory,
    contactName: params.contactName,
    leadCompany: params.leadCompany,
  })

  const reply = await draftReply({ understanding, memory })
  const summary = buildSummary(understanding, params.contactName, params.leadCompany)

  return {
    summary,
    goal: reply.goal,
    recommended_reply: reply.recommended_reply,
    tone: reply.tone,
  }
}

// Helpers

function buildSummary(u: CopilotUnderstandResult, contactName?: string | null, company?: string): string {
  const who = contactName ?? 'They'
  switch (u.intent) {
    case 'meeting_request':
      return `${who} wants to talk - confirm the call.`
    case 'interested':
      return `${who} is interested${u.questions.length ? ' and asking ' + u.questions.length + ' question(s)' : ''}.`
    case 'pricing':
      return `${who} asked about pricing - share commercial context, do not invent a number.`
    case 'objection':
      return `${who} raised an objection (${u.objection ?? 'unspecified'}) - address honestly.`
    case 'question':
      return `${who} asked ${u.questions.length} question(s) - answer directly first.`
    case 'not_interested':
      return `${who} is not interested - close gracefully.`
    default:
      return `${who}'s intent is unclear - clarify the most valuable unknown.`
  }
}

function normalizeIntent(v: string | null): CopilotUnderstandResult['intent'] {
  const valid: CopilotUnderstandResult['intent'][] = ['interested', 'objection', 'question', 'pricing', 'not_interested', 'meeting_request', 'unclear']
  return (valid.includes(v as any) ? v : 'unclear') as CopilotUnderstandResult['intent']
}

function normalizeSentiment(v: string | null): CopilotUnderstandResult['sentiment'] {
  const valid: CopilotUnderstandResult['sentiment'][] = ['positive', 'neutral', 'negative']
  return (valid.includes(v as any) ? v : 'neutral') as CopilotUnderstandResult['sentiment']
}

function normalizeConfidence(v: string | null): CopilotUnderstandResult['confidence'] {
  const valid: CopilotUnderstandResult['confidence'][] = ['high', 'medium', 'low']
  return (valid.includes(v as any) ? v : 'low') as CopilotUnderstandResult['confidence']
}

export { buildConversationMemory }
export type { ConversationMemory, CopilotUnderstandResult, CopilotResponse, CopilotReplyResult }
