import type { Lead, Message, Outcome } from '@/lib/domain/types'
import type { RateMetric } from '@/lib/store/types'

export interface RateBucket {
  lead: Lead
  sentMessages: Message[]
  outcomes: Outcome[]
}

/**
 * Team metrics, defined once so the demo store and the Supabase store cannot
 * drift apart:
 *
 *   reply rate      = distinct leads with a 'replied' outcome
 *                     / distinct leads with at least one sent message
 *   read-to-check   = distinct leads with a 'check' outcome
 *                     / distinct leads with a 'read' outcome
 *
 * Rates are null when the denominator is zero.
 */
export function computeRates(buckets: RateBucket[]): RateMetric {
  let sentLeads = 0
  let repliedLeads = 0
  let readLeads = 0
  let checkedLeads = 0
  let sent = 0

  for (const b of buckets) {
    const hasSent = b.sentMessages.some((m) => m.sentAt)
    sent += b.sentMessages.filter((m) => m.sentAt).length
    const stages = new Set(b.outcomes.map((o) => o.stage))
    if (hasSent) sentLeads += 1
    if (stages.has('replied')) repliedLeads += 1
    if (stages.has('read')) readLeads += 1
    if (stages.has('check')) checkedLeads += 1
  }

  return {
    sent,
    sentLeads,
    repliedLeads,
    replyRate: sentLeads > 0 ? repliedLeads / sentLeads : null,
    readLeads,
    checkedLeads,
    readToCheckRate: readLeads > 0 ? checkedLeads / readLeads : null,
  }
}

export function emptyRates(): RateMetric {
  return {
    sent: 0,
    sentLeads: 0,
    repliedLeads: 0,
    replyRate: null,
    readLeads: 0,
    checkedLeads: 0,
    readToCheckRate: null,
  }
}