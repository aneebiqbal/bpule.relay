/**
 * Conversation Copilot — shared types
 */

export interface CopilotUnderstandResult {
  intent: 'interested' | 'objection' | 'question' | 'pricing' | 'not_interested' | 'meeting_request' | 'unclear'
  sentiment: 'positive' | 'neutral' | 'negative'
  questions: string[]
  objection: string | null
  commercial_signal: boolean
  objective: string
  missing_context: string[]
  relevant_evidence_ids: string[]
  knowledge_release: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface CopilotReplyResult {
  recommended_reply: string
  goal: string
  tone: string
  cta_strategy: string
}

/** User-facing output — internal JSON never exposed */
export interface CopilotResponse {
  summary: string          // one-line human read of the situation
  goal: string
  recommended_reply: string
  tone: string
  variants?: {
    shorter?: string
    warmer?: string
    more_direct?: string
  }
}
