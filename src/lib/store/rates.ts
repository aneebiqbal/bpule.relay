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

/**
 * One (owner, play) group of the rate aggregate. The SQL path returns these
 * directly; the JS fallback derives them from `computeRates` so both paths
 * produce the same shape.
 */
export interface RateGroup {
  ownerRepId: string | null
  playId: string | null
  sentLeads: number
  sent: number
  repliedLeads: number
  readLeads: number
  checkedLeads: number
}

/** Sum groups into one metric. Ratios are recomputed from the summed counts. */
export function rateMetricFromGroups(groups: readonly RateGroup[]): RateMetric {
  let sent = 0
  let sentLeads = 0
  let repliedLeads = 0
  let readLeads = 0
  let checkedLeads = 0
  for (const g of groups) {
    sent += g.sent
    sentLeads += g.sentLeads
    repliedLeads += g.repliedLeads
    readLeads += g.readLeads
    checkedLeads += g.checkedLeads
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

/**
 * Rate aggregate in SQL. Messages and outcomes are pre-aggregated per lead so
 * the lead join cannot multiply the send count. Scoped to the org and the same
 * non-archived lead set `fetchLeadsAll()` reads.
 */
export const RATE_GROUP_SQL = `WITH m AS (
  SELECT lead_id, COUNT(*) AS sent
  FROM messages
  WHERE organization_id = ? AND sent_at IS NOT NULL
  GROUP BY lead_id
), o AS (
  SELECT lead_id,
    BOOL_OR(stage = 'replied') AS replied,
    BOOL_OR(stage = 'read') AS read,
    BOOL_OR(stage = 'check') AS checked
  FROM outcomes
  WHERE organization_id = ?
  GROUP BY lead_id
)
SELECT
  l.owner_rep_id AS owner_rep_id,
  l.play_id AS play_id,
  COUNT(*) FILTER (WHERE m.sent > 0) AS sent_leads,
  COALESCE(SUM(m.sent), 0) AS sent,
  COUNT(*) FILTER (WHERE o.replied) AS replied_leads,
  COUNT(*) FILTER (WHERE o.read) AS read_leads,
  COUNT(*) FILTER (WHERE o.checked) AS checked_leads
FROM leads l
LEFT JOIN m ON m.lead_id = l.id
LEFT JOIN o ON o.lead_id = l.id
WHERE l.organization_id = ? AND l.archived = false
GROUP BY l.owner_rep_id, l.play_id`