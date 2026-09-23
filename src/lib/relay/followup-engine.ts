import type { Lead, Message, OutreachStrategy } from '@/lib/domain/types'
import { businessDaysBetween } from '@/lib/leads/followup'

/**
 * Follow-up Engine
 *
 * Context-aware follow-ups that never blindly say "just following up."
 * Uses: original message, lead developments, conversation state, sender proof,
 * previous follow-ups, elapsed time.
 */

export interface FollowupContext {
  lead: Lead
  priorMessages: Message[]
  conversationStage: string
  senderProfileId: string | null
  followupCount: number
  lastSentAt: string | null
  lastReplyAt: string | null
  now?: Date
}

export interface FollowupStrategy {
  shouldFollowUp: boolean
  reason: string
  approach: string
  tone: string
  ctaApproach: string
  valueAdd: string | null
  waitReason: string | null
}

/**
 * Determine if and how to follow up.
 */
export function determineFollowup(context: FollowupContext): FollowupStrategy {
  const { lead, priorMessages, lastSentAt, followupCount, now = new Date() } = context

  // No prior send = no follow-up
  if (!lastSentAt) {
    return {
      shouldFollowUp: false,
      reason: 'No prior message sent.',
      approach: 'none',
      tone: 'none',
      ctaApproach: 'none',
      valueAdd: null,
      waitReason: 'Send a first message before following up.',
    }
  }

  // All 3 follow-ups already used = no more (the Relay rule, raised from 1
  // to 3 per the approved product design — a lead can receive up to 3
  // follow-ups total across its life, not just one).
  if (followupCount >= 3) {
    return {
      shouldFollowUp: false,
      reason: 'All 3 follow-ups already used. Relay does not send a fourth.',
      approach: 'none',
      tone: 'none',
      ctaApproach: 'none',
      valueAdd: null,
      waitReason: 'Maximum three follow-ups per lead.',
    }
  }

  // Has replied = no follow-up needed
  if (lead.status === 'replied' || context.lastReplyAt) {
    return {
      shouldFollowUp: false,
      reason: 'Lead has already replied.',
      approach: 'none',
      tone: 'none',
      ctaApproach: 'none',
      valueAdd: null,
      waitReason: 'Reply to their message instead of following up.',
    }
  }

  // Check if enough time has passed (5 business days)
  const daysSince = businessDaysBetween(new Date(lastSentAt), now)
  if (daysSince < 5) {
    return {
      shouldFollowUp: false,
      reason: `Only ${daysSince} business days since last send. Wait for 5.`,
      approach: 'none',
      tone: 'none',
      ctaApproach: 'none',
      valueAdd: null,
      waitReason: `Wait ${5 - daysSince} more business day(s).`,
    }
  }

  // Determine the approach based on what was sent before
  const lastSent = priorMessages
    .filter((m) => m.sentText && m.sentAt)
    .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
    .at(-1)

  const lastText = lastSent?.sentText ?? ''

  // Choose approach based on the original message's content
  const approach = chooseFollowupApproach(lastText, lead)

  return {
    shouldFollowUp: true,
    reason: `${daysSince} business days since last send. Follow-up ${followupCount + 1} of 3 allowed.`,
    approach: approach.approach,
    tone: approach.tone,
    ctaApproach: approach.ctaApproach,
    valueAdd: approach.valueAdd,
    waitReason: null,
  }
}

function chooseFollowupApproach(
  lastSentText: string,
  _lead: Lead,
): {
  approach: string
  tone: string
  ctaApproach: string
  valueAdd: string | null
} {
  const lower = lastSentText.toLowerCase()

  // If the original offered a "free Read", the follow-up should NOT repeat that
  if (lower.includes('free read') || lower.includes('quick read')) {
    return {
      approach: 'Light nudge with a different angle. Do not repeat the Read offer.',
      tone: 'brief, no pressure',
      ctaApproach: 'Easy yes/no or "not now"',
      valueAdd: null,
    }
  }

  // If the original asked a question, follow up on that
  if (lastSentText.includes('?')) {
    return {
      approach: 'Reference the original question. Make it easy to answer.',
      tone: 'curious, patient',
      ctaApproach: 'Re-ask the core question in a simpler way',
      valueAdd: null,
    }
  }

  // If the original referenced a specific project/detail
  if (lower.includes('noticed') || lower.includes('saw') || lower.includes('building')) {
    return {
      approach: 'Add a small new observation or thought. Show you are paying attention.',
      tone: 'observational, light',
      ctaApproach: 'Permission to share something useful or close the loop',
      valueAdd: 'One specific observation or thought related to their work',
    }
  }

  // Default: short, graceful nudge
  return {
    approach: 'Short nudge. Acknowledge they are busy. Give an easy out.',
    tone: 'respectful, brief',
    ctaApproach: '"Not now" is a perfect reply',
    valueAdd: null,
  }
}

/**
 * Build the follow-up prompt context.
 */
export function buildFollowupPrompt(
  context: FollowupContext,
  strategy: FollowupStrategy,
): string {
  const parts: string[] = []

  parts.push(`## Follow-up Message`)
  parts.push(`This follow-up is allowed under the 3-per-lead cap (${strategy.reason})`)
  parts.push(``)
  parts.push(`### Approach: ${strategy.approach}`)
  parts.push(`### Tone: ${strategy.tone}`)
  parts.push(`### CTA: ${strategy.ctaApproach}`)

  if (strategy.valueAdd) {
    parts.push(`### Value to add: ${strategy.valueAdd}`)
  }

  parts.push(``)
  parts.push(`### What was sent before:`)
  const lastSent = context.priorMessages
    .filter((m) => m.sentText && m.sentAt)
    .sort((a, b) => (a.sentAt ?? '').localeCompare(b.sentAt ?? ''))
    .at(-1)

  if (lastSent?.sentText) {
    parts.push(`"${lastSent.sentText}"`)
  }

  parts.push(``)
  parts.push(`### Rules:`)
  parts.push(`- Do NOT say "just following up" or "checking in" or "bumping this"`)
  parts.push(`- 15–45 words. Add ONE new reason to reply, or close the loop.`)
  parts.push(`- Give them an easy way to say "not now"`)
  parts.push(`- Do not repeat the exact same offer as the first message`)
  parts.push(`- Do not dump biography, proof, or BPulse positioning`)

  return parts.join('\n')
}
