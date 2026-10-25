/**
 * Outcome time metrics (Phase 12).
 *
 * Derives clean timestamps and durations from a lead's messages and stored
 * outcomes so time-to-meeting / proposal / win can be reported. No causal
 * claim is made — this only captures the data.
 */

import { classifyInboundReply } from './outcomes'

export interface OutcomeTimings {
  firstContactAt: string | null
  firstReplyAt: string | null
  firstCommercialReplyAt: string | null
  meetingAt: string | null
  proposalAt: string | null
  wonAt: string | null
  lostAt: string | null
  timeToFirstReplyMs: number | null
  timeToCommercialReplyMs: number | null
  timeToMeetingMs: number | null
  timeToProposalMs: number | null
  timeToWinMs: number | null
}

export interface OutcomeTimingInput {
  firstContactAt: string | null
  inbound: Array<{ at: string; text: string | null }>
  /** Stored outcome stages with when they occurred (newest first is fine). */
  storedStages: Array<{ stage: string; at: string | null }>
  wonAt?: string | null
  lostAt?: string | null
}

const first = (list: string[]): string | null => {
  const valid = list.filter(Boolean).sort()
  return valid[0] ?? null
}

export function deriveOutcomeTimings(input: OutcomeTimingInput): OutcomeTimings {
  const contact = input.firstContactAt

  const inboundAt = input.inbound
    .map((m) => (m.at ? new Date(m.at).getTime() : NaN))
    .filter((t) => Number.isFinite(t))

  const firstReplyAt = inboundAt.length > 0 ? new Date(Math.min(...inboundAt)).toISOString() : null

  const commercial = input.inbound
    .filter((m) => m.text && classifyInboundReply(m.text) === 'POSITIVE_COMMERCIAL_REPLY')
    .map((m) => (m.at ? new Date(m.at).getTime() : NaN))
    .filter((t) => Number.isFinite(t))
  const firstCommercialReplyAt = commercial.length > 0 ? new Date(Math.min(...commercial)).toISOString() : null

  const stages = input.storedStages.filter((s) => s.at)
  const meetingAt = first(stages.filter((s) => s.stage === 'meeting').map((s) => s.at as string))
  const proposalAt = first(stages.filter((s) => s.stage === 'proposal').map((s) => s.at as string))
  const wonAt = input.wonAt ?? first(stages.filter((s) => s.stage === 'won').map((s) => s.at as string))
  const lostAt = input.lostAt ?? first(stages.filter((s) => s.stage === 'lost').map((s) => s.at as string))

  const contactMs = contact ? new Date(contact).getTime() : NaN
  const delta = (iso: string | null): number | null => {
    if (!iso || !Number.isFinite(contactMs)) return null
    const t = new Date(iso).getTime()
    return Number.isFinite(t) ? Math.max(0, t - contactMs) : null
  }

  return {
    firstContactAt: contact,
    firstReplyAt,
    firstCommercialReplyAt,
    meetingAt,
    proposalAt,
    wonAt,
    lostAt,
    timeToFirstReplyMs: delta(firstReplyAt),
    timeToCommercialReplyMs: delta(firstCommercialReplyAt),
    timeToMeetingMs: delta(meetingAt),
    timeToProposalMs: delta(proposalAt),
    timeToWinMs: delta(wonAt),
  }
}
