import type { DbClient } from '@/lib/db/types'
/**
 * One bounded read of the canonical outcome events (MEETING_BOOKED, CLIENT_WON)
 * for a rep set and window. Every home / team surface that shows meetings or
 * wins for a period uses this, so the numbers agree (src/lib/sales/meetings.ts).
 */
import { isMissingRelation } from '@/lib/operations/db-errors'
import {
  MEETING_EVENT,
  WIN_EVENT,
  countMeetingEvents,
  countWinEvents,
  outcomeEventsByActor,
  type MeetingEventLike,
} from '@/lib/sales/meetings'

export interface OutcomeEventCounts {
  byActor: Map<string, { meetings: number; wins: number }>
  meetings: number
  wins: number
}

const CAP = 5000

export function emptyOutcomeEventCounts(): OutcomeEventCounts {
  return { byActor: new Map(), meetings: 0, wins: 0 }
}

export async function loadOutcomeEventCounts(
  client: DbClient,
  query: { orgId: string; repIds: string[] | null; start: string; end: string },
): Promise<OutcomeEventCounts> {
  if (query.repIds && query.repIds.length === 0) return emptyOutcomeEventCounts()
  let q = client
    .from('action_events')
    .select('actor_id, action_type, execution_status')
    .eq('organization_id', query.orgId)
    .in('action_type', [MEETING_EVENT, WIN_EVENT])
    .gte('occurred_at', query.start)
    .lt('occurred_at', query.end)
    .limit(CAP)
  if (query.repIds) q = q.in('actor_id', query.repIds)
  const { data, error } = await q
  if (error) {
    if (isMissingRelation(error)) return emptyOutcomeEventCounts()
    throw error
  }
  const rows = (data ?? []) as MeetingEventLike[]
  return { byActor: outcomeEventsByActor(rows), meetings: countMeetingEvents(rows), wins: countWinEvents(rows) }
}
