/**
 * Canonical meeting truth (Phase 8 / Slice B).
 *
 * - WHEN a meeting happened: one `MEETING_BOOKED` action event, emitted by
 *   POST /api/leads/[id]/status (status_type = meeting_booked) at the moment
 *   the rep records it. Period counts ("meetings this week") read only this.
 * - WHERE a lead is NOW: `conversation_states.stage = 'meeting'`.
 *
 * A meeting is not a win. Before Slice B the status route set the lead to
 * `won` and emitted CLIENT_WON for a booked meeting; meetings recorded that
 * way are wins in the historical data and are not re-labelled here.
 *
 * Every surface that shows meetings for a period — Rep Home, Manager Home,
 * Admin Home, Rep 360, Team Performance, /performance, Reports — counts with
 * `countMeetingEvents` / `meetingsByActor` over the same events.
 */

export const MEETING_EVENT = 'MEETING_BOOKED' as const
export const WIN_EVENT = 'CLIENT_WON' as const

import { MEETING_OR_LATER_STAGES as MEETING_OR_LATER } from '@/lib/sales/stage-vocabulary'

/** Conversation stages at or past a booked meeting (current-state questions only). */
export const MEETING_OR_LATER_STAGES: ReadonlySet<string> = new Set(MEETING_OR_LATER)

export interface MeetingEventLike {
  action_type: string
  actor_id?: string | null
  execution_status?: string | null
}

function counts(e: MeetingEventLike, type: string): boolean {
  return e.action_type === type && e.execution_status !== 'failed'
}

export function countMeetingEvents(events: readonly MeetingEventLike[]): number {
  return events.filter((e) => counts(e, MEETING_EVENT)).length
}

export function countWinEvents(events: readonly MeetingEventLike[]): number {
  return events.filter((e) => counts(e, WIN_EVENT)).length
}

/** Meetings and wins per actor from one event list. */
export function outcomeEventsByActor(
  events: readonly MeetingEventLike[],
): Map<string, { meetings: number; wins: number }> {
  const out = new Map<string, { meetings: number; wins: number }>()
  for (const e of events) {
    if (!e.actor_id) continue
    const isMeeting = counts(e, MEETING_EVENT)
    const isWin = counts(e, WIN_EVENT)
    if (!isMeeting && !isWin) continue
    const row = out.get(e.actor_id) ?? { meetings: 0, wins: 0 }
    if (isMeeting) row.meetings += 1
    if (isWin) row.wins += 1
    out.set(e.actor_id, row)
  }
  return out
}

export function isInMeetingStage(stage: string | null | undefined): boolean {
  return stage === 'meeting'
}

/**
 * Historical "did this lead ever reach a meeting" (training data, routing
 * evidence): a MEETING_BOOKED event for the lead, or a conversation stage at
 * or past meeting. Lead status is never a meeting signal — `meeting_booked`
 * is not a lead status.
 */
export function leadReachedMeeting(input: { hasMeetingEvent: boolean; stage: string | null | undefined }): boolean {
  return input.hasMeetingEvent || MEETING_OR_LATER_STAGES.has(input.stage ?? '')
}
