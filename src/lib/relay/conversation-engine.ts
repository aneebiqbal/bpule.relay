import type { ConversationStage, Message, OutreachStrategy } from '@/lib/domain/types'

/**
 * Conversation Engine
 *
 * Manages conversation state transitions, reply drafting, and context tracking.
 * This cannot end after the first DM — Relay must handle the full lifecycle.
 */

export interface ReplyContext {
  leadId: string
  leadCompany: string
  contactName: string | null
  replyText: string
  priorMessages: Message[]
  conversationStage: ConversationStage
  senderProfileId: string | null
}

export interface ReplyAnalysis {
  intent: 'interested' | 'objection' | 'question' | 'pricing' | 'not_interested' | 'meeting_request' | 'unclear'
  sentiment: 'positive' | 'neutral' | 'negative'
  questions: string[]
  objections: string[]
  buyingSignal: boolean
  requestedInformation: string[]
  nextBestAction: string
}

/**
 * Analyze an incoming reply from a prospect.
 */
export function analyzeReply(replyText: string, _context: ReplyContext): ReplyAnalysis {
  const lower = replyText.toLowerCase()
  const analysis: ReplyAnalysis = {
    intent: 'unclear',
    sentiment: 'neutral',
    questions: [],
    objections: [],
    buyingSignal: false,
    requestedInformation: [],
    nextBestAction: 'clarify',
  }

  // Extract questions
  const questionMatches = replyText.match(/[^.!?]+\?/g) ?? []
  analysis.questions = questionMatches.map((q) => q.trim())

  // Detect intent
  if (/\b(not interested|not a fit|no thanks|pass|not looking)\b/i.test(lower)) {
    analysis.intent = 'not_interested'
    analysis.sentiment = 'negative'
    analysis.nextBestAction = 'graceful_close'
  } else if (/\b(how much|pricing|cost|rate|budget|what is your)\b/i.test(lower)) {
    analysis.intent = 'pricing'
    analysis.nextBestAction = 'share_pricing_context'
  } else if (/\b(book|schedule|call|meeting|zoom|chat about)\b/i.test(lower)) {
    analysis.intent = 'meeting_request'
    analysis.buyingSignal = true
    analysis.sentiment = 'positive'
    analysis.nextBestAction = 'move_to_meeting'
  } else if (/\b(tell me more|more info|elaborate|what do you mean)\b/i.test(lower)) {
    analysis.intent = 'interested'
    analysis.buyingSignal = true
    analysis.sentiment = 'positive'
    analysis.nextBestAction = 'provide_more_detail'
  } else if (/\b(concern|worried|not sure|skeptical|how do I know)\b/i.test(lower)) {
    analysis.intent = 'objection'
    analysis.nextBestAction = 'address_objection'
  } else if (analysis.questions.length > 0) {
    analysis.intent = 'question'
    analysis.nextBestAction = 'answer_question'
  }

  // Detect buying signals
  if (/\b(interested|let's do it|next step|move forward|sounds good|works for me)\b/i.test(lower)) {
    analysis.buyingSignal = true
  }

  // Detect objections
  const objectionPatterns = [
    { pattern: /\b(too expensive|out of budget|can't afford)\b/i, objection: 'pricing' },
    { pattern: /\b(not the right time|timing|too busy)\b/i, objection: 'timing' },
    { pattern: /\b(already have|already working with)\b/i, objection: 'existing_solution' },
    { pattern: /\b(need to think|let me get back)\b/i, objection: 'hesitation' },
  ]
  for (const { pattern, objection } of objectionPatterns) {
    if (pattern.test(lower)) analysis.objections.push(objection)
  }

  return analysis
}

/**
 * Get the next conversation stage based on reply analysis.
 */
export function getNextStage(
  currentStage: ConversationStage,
  analysis: ReplyAnalysis,
): ConversationStage {
  if (analysis.intent === 'not_interested') return 'lost'
  if (analysis.intent === 'meeting_request') return 'meeting'
  if (analysis.buyingSignal && currentStage === 'replied') return 'qualifying'
  if (analysis.buyingSignal && currentStage === 'qualifying') return 'interested'
  if (analysis.intent === 'interested') return 'qualifying'
  return currentStage
}

/**
 * Build a reply strategy based on the analysis.
 */
export function buildReplyStrategy(
  analysis: ReplyAnalysis,
  context: ReplyContext,
  _strategy: OutreachStrategy | null,
): {
  goal: string
  approach: string
  tone: string
  ctaStrategy: string
} {
  switch (analysis.intent) {
    case 'interested':
      return {
        goal: 'Move toward concrete next step',
        approach: `Respond to their interest and propose a light next step. ${analysis.questions.length > 0 ? 'Answer their questions directly first.' : ''}`,
        tone: 'warm, direct, no pressure',
        ctaStrategy: analysis.buyingSignal
          ? 'Suggest a specific, low-friction next action (share a thought, send a one-pager, quick call)'
          : 'Offer to share something useful, ask a clarifying question',
      }

    case 'objection':
      return {
        goal: 'Address the objection honestly',
        approach: `Acknowledge their concern. ${analysis.objections.includes('pricing') ? 'Share context on how pricing works without being defensive.' : analysis.objections.includes('timing') ? 'Make it easy to pause and resume later.' : 'Provide specific evidence that addresses their concern.'}`,
        tone: 'empathetic, honest, not pushy',
        ctaStrategy: 'No hard CTA — earn trust first',
      }

    case 'pricing':
      return {
        goal: 'Share pricing context naturally',
        approach: 'Give a range or framework, not a hard number. Relate it to value/outcome.',
        tone: 'transparent, professional',
        ctaStrategy: 'Offer to share a more specific range based on scope',
      }

    case 'meeting_request':
      return {
        goal: 'Confirm and prepare for the meeting',
        approach: 'Acknowledge enthusiastically. Confirm time/preferences. Prepare them with one thing to think about.',
        tone: 'professional, prepared',
        ctaStrategy: 'Confirm logistics + set a tiny expectation for the call',
      }

    case 'question':
      return {
        goal: 'Answer their questions directly',
        approach: 'Address each question in order. Be specific. If a question is about capability, reference relevant proof.',
        tone: 'helpful, specific',
        ctaStrategy: 'After answering, ask a relevant follow-up question to keep the conversation moving',
      }

    case 'not_interested':
      return {
        goal: 'Leave the door open gracefully',
        approach: 'Acknowledge, thank them, leave a light touch for the future. No pressure.',
        tone: 'gracious, brief',
        ctaStrategy: 'None — just a clean close',
      }

    case 'unclear':
    default:
      return {
        goal: 'Clarify their intent',
        approach: 'Ask a specific question to understand what they need.',
        tone: 'curious, helpful',
        ctaStrategy: 'End with one clear question',
      }
  }
}

/**
 * Build the full conversation context for the message generator.
 */
export function buildConversationContext(
  context: ReplyContext,
  analysis: ReplyAnalysis,
): string {
  const parts: string[] = []

  parts.push(`## Conversation Context`)
  parts.push(`Company: ${context.leadCompany}`)
  if (context.contactName) parts.push(`Contact: ${context.contactName}`)
  parts.push(`Stage: ${context.conversationStage}`)
  parts.push(`Their reply intent: ${analysis.intent}`)
  parts.push(`Sentiment: ${analysis.sentiment}`)

  if (context.priorMessages.length > 0) {
    parts.push(``)
    parts.push(`### What was already said:`)
    for (const msg of context.priorMessages.filter((m) => m.sentText).slice(-5)) {
      parts.push(`- [${msg.type}] ${msg.sentText}`)
    }
  }

  if (context.replyText) {
    parts.push(``)
    parts.push(`### Their latest message:`)
    parts.push(context.replyText)
  }

  if (analysis.questions.length > 0) {
    parts.push(``)
    parts.push(`### Questions to answer:`)
    for (const q of analysis.questions) {
      parts.push(`- ${q}`)
    }
  }

  if (analysis.objections.length > 0) {
    parts.push(``)
    parts.push(`### Objections to address:`)
    for (const o of analysis.objections) {
      parts.push(`- ${o}`)
    }
  }

  return parts.join('\n')
}
