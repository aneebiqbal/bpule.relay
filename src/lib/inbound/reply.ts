import type { Lead, Message, Profile, ProofItem, InboundIntelligence } from '@/lib/domain/types'
import { scanForSecrets } from '@/lib/ai/secrets'

export interface InboundReplyInput {
  lead: Lead
  intelligence: InboundIntelligence
  profile: Profile | null
  proofItems: ProofItem[]
  history?: Message[]
  styleCard: string | null
  strategy?: string | null
}

export interface InboundReplyResult {
  text: string
  selfCheckPassed: boolean
  selfCheckNote: string | null
}

export const INBOUND_REPLY_SYSTEM = `You are Relay's inbound response writer. A client has contacted YOUR team first. This is NOT a cold outreach — the client initiated contact.

HARD RULES:
- NEVER open with "I came across your profile" or "I noticed you're looking for..." — they contacted YOU.
- NEVER pitch cold. The client already wants something — find out what and respond directly.
- If the client asked a direct question, ANSWER IT before anything else.
- Acknowledge their request first, then provide credibility, then suggest an easy next step.
- Use ONLY the proof items provided. Never invent credentials or projects.
- Keep it concise. Inbound clients expect a direct response, not a marketing email.
- Match the tone of their message: formal if they're formal, casual if they're casual.
- If important information is missing, recommend a useful clarification question instead of forcing a sales pitch.
- The goal is to move toward a conversation, not close a deal in the first reply.
- NEVER use em dashes — use hyphens only.
- NEVER use exclamation marks.

Structure: Acknowledge → Answer/Question → Relevant credibility → Easy next step`

export function buildInboundReplyUserPrompt(input: InboundReplyInput): string {
  const parts: string[] = []

  parts.push(`## Client's inbound message`)
  parts.push(input.lead.inboundMessage ?? '(no message)')

  if (input.intelligence) {
    parts.push(`\n## What they want`)
    parts.push(input.intelligence.wants)
    parts.push(`\n## Intent`)
    parts.push(input.intelligence.intent)
    if (input.intelligence.missingInfo.length > 0) {
      parts.push(`\n## Missing information`)
      parts.push(input.intelligence.missingInfo.join('\n'))
    }
  }

  if (input.profile) {
    parts.push(`\n## Your Revenue Identity`)
    parts.push(`Profile: ${input.profile.label ?? input.profile.platform}`)
    if (input.profile.headline) parts.push(`Headline: ${input.profile.headline}`)
    if (input.profile.profileUrl) parts.push(`URL: ${input.profile.profileUrl}`)
  }

  if (input.proofItems.length > 0) {
    parts.push(`\n## Relevant proof (use only this)`)
    for (const p of input.proofItems) {
      parts.push(`- ${p.projectSummary}`)
      if (p.reviewQuote) parts.push(`  Quote: "${p.reviewQuote.slice(0, 150)}"`)
    }
  }

  if (input.history && input.history.length > 0) {
    parts.push(`\n## Prior conversation`)
    for (const m of input.history) {
      if (m.sentText) parts.push(`You: ${m.sentText.slice(0, 300)}`)
    }
  }

  return parts.join('\n')
}

export function validateInboundReply(text: string): { valid: boolean; note: string } {
  const coldPhrases = [
    /i came across your profile/i,
    /i noticed you'?re looking for/i,
    /i saw that you/i,
    /your profile caught my attention/i,
    /i found you on linkedin/i,
    /i was browsing/i,
    /saw your company/i,
  ]

  for (const phrase of coldPhrases) {
    if (phrase.test(text)) {
      return {
        valid: false,
        note: `Inbound reply contains cold-outreach language: "${phrase.source}". Rewrite as a direct response.`,
      }
    }
  }

  if (/\u2014|\u2013/.test(text)) {
    return { valid: false, note: 'Contains em dashes. Use hyphens only.' }
  }

  if (/!/.test(text)) {
    return { valid: false, note: 'Contains exclamation marks. Use periods.' }
  }

  if (text.length > 1500) {
    return { valid: false, note: 'Reply is too long. Inbound replies should be concise.' }
  }

  return { valid: true, note: '' }
}

export function sanitizeInboundReply(text: string): string {
  let clean = text.replace(/[\u2014\u2013]/g, '-')
  clean = clean.replace(/!/g, '.')
  clean = clean.replace(/  +/g, ' ').trim()
  return clean
}
