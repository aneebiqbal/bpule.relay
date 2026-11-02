/**
 * Cross-surface contract (Phase 8 final activation): one synthetic day of
 * events, counted by every surface's own counting function, must give the
 * same sends, meetings and wins. Drafts, generated copy and failed sends are
 * never sends; meetings are MEETING_BOOKED events; `meeting_booked` is not a
 * lead status.
 */
import { describe, expect, it } from 'vitest'
import { aggregateMetrics, groupMetrics, identityResolver, type PerfEvent } from '@/lib/operations/performance'
import { canonicalActionFor } from '@/lib/performance/activity-model'
import { assembleTargets, targetTypeForEvent } from '@/lib/operations/targets'
import { CONNECTION_EVENTS, SENT_MESSAGE_EVENTS, isExecutedSend } from '@/lib/sales/send-truth'
import { countMeetingEvents, countWinEvents, leadReachedMeeting } from '@/lib/sales/meetings'

// 'sent' is production's executed status (action_events_execution_status_check:
// generated | sent | delivered | failed).
const ev = (action_type: string, execution_status: string | null = 'sent', lead_id = 'l1'): PerfEvent => ({
  actor_id: 'rep-a', action_type, execution_status, lead_id, sender_profile_id: 'prof-1',
})

const DAY: PerfEvent[] = [
  ev('CONNECTION_SENT'), ev('CONNECTION_SENT', 'sent', 'l2'), ev('CONNECTION_SENT', 'failed'),
  ev('DM_SENT'), ev('FOLLOWUP_SENT'), ev('REPLY_SENT'), ev('DM_SENT', 'failed'),
  // Drafts / generated copy — never sends.
  ev('CONNECTION_PREPARED'), ev('CONNECTION_PREPARED'), ev('DM_PREPARED'), ev('DM_PREPARED'), ev('MESSAGE_GENERATED'), ev('DRAFT_GENERATED'),
  ev('MEETING_BOOKED'), ev('CLIENT_WON'), ev('REPLY_RECEIVED'),
]
const EXPECTED = { connections: 2, messages: 3, meetings: 1, wins: 1 }

describe('SEND_TRUTH_CROSS_SURFACE', () => {
  it('Team Performance / Rep Home scoreboard (aggregateMetrics)', () => {
    const m = aggregateMetrics(DAY)
    expect({ connections: m.connections, messages: m.messages, meetings: m.meetings, wins: m.wins }).toEqual(EXPECTED)
  })

  it('Admin Home profile rows (groupMetrics by the identity on the sending profile)', () => {
    const toIdentity = identityResolver([{ id: 'ident-1', profile_id: 'prof-1' }], () => null)
    const m = groupMetrics(DAY, toIdentity).get('ident-1')!
    expect({ connections: m.connections, messages: m.messages, meetings: m.meetings, wins: m.wins }).toEqual(EXPECTED)
  })

  it('personal /performance (canonicalActionFor)', () => {
    const actions = DAY.map((e) => canonicalActionFor(e.action_type, e.execution_status)).filter(Boolean)
    expect({
      connections: actions.filter((a) => a === 'CONNECTION_SENT').length,
      messages: actions.filter((a) => a === 'FIRST_DM_SENT' || a === 'FOLLOWUP_SENT' || a === 'REPLY_SENT').length,
      meetings: actions.filter((a) => a === 'MEETING_BOOKED').length,
      wins: actions.filter((a) => a === 'LEAD_WON').length,
    }).toEqual(EXPECTED)
  })

  it('Targets progress (targetTypeForEvent / assembleTargets)', () => {
    const types = DAY.map((e) => targetTypeForEvent(e.action_type, e.execution_status))
    expect(types.filter((t) => t === 'CONNECTIONS')).toHaveLength(EXPECTED.connections)
    expect(types.filter((t) => t === 'MESSAGES_SENT')).toHaveLength(EXPECTED.messages)
    expect(types.filter((t) => t === 'MEETINGS')).toHaveLength(EXPECTED.meetings)
    const data = assembleTargets({
      period: 'DAY', elapsedShare: 1, reps: [{ id: 'rep-a', name: 'A' }], teams: [],
      dailyTargets: [{ rep_id: 'rep-a', activity_type: 'dm', target_count: 5 }], events: DAY,
    })
    const cell = data.reps[0].cells.find((c) => c.type === 'MESSAGES_SENT')!
    expect(cell).toMatchObject({ goal: 5, progress: 3, remaining: 2 })
  })

  it('Reports (zero-row counts over the shared type lists, failures excluded)', () => {
    const count = (types: readonly string[]) => DAY.filter((e) => types.includes(e.action_type) && e.execution_status !== 'failed').length
    expect(count(CONNECTION_EVENTS)).toBe(EXPECTED.connections)
    expect(count(SENT_MESSAGE_EVENTS)).toBe(EXPECTED.messages)
  })

  it('isExecutedSend agrees with every surface', () => {
    expect(DAY.filter((e) => isExecutedSend(e.action_type, e.execution_status))).toHaveLength(EXPECTED.connections + EXPECTED.messages)
  })
})

describe('MEETING_TRUTH_CROSS_SURFACE', () => {
  it('meeting / win counters agree with aggregateMetrics', () => {
    expect(countMeetingEvents(DAY)).toBe(EXPECTED.meetings)
    expect(countWinEvents(DAY)).toBe(EXPECTED.wins)
    expect(countMeetingEvents([ev('MEETING_BOOKED', 'failed')])).toBe(0)
  })

  it('historical "reached a meeting" = event or stage at/after meeting — never lead status', () => {
    expect(leadReachedMeeting({ hasMeetingEvent: true, stage: 'replied' })).toBe(true)
    expect(leadReachedMeeting({ hasMeetingEvent: false, stage: 'proposal' })).toBe(true)
    expect(leadReachedMeeting({ hasMeetingEvent: false, stage: 'replied' })).toBe(false)
    expect(leadReachedMeeting({ hasMeetingEvent: false, stage: null })).toBe(false)
  })

  it('no source file tests the nonexistent lead status `meeting_booked`', async () => {
    const { execSync } = await import('node:child_process')
    const hits = execSync(
      "grep -rnE \"status *===? *'meeting_booked'\" src --include='*.ts' --include='*.tsx' || true",
      { encoding: 'utf8' },
    ).trim()
    expect(hits).toBe('')
  })
})

describe('PROFILE_IDENTITY_ATTRIBUTION', () => {
  // sender_profile_id is a profiles.id; performance is reported per revenue identity.
  const identities = [
    { id: 'ident-cloud', profile_id: 'prof-cloud' },
    { id: 'ident-a', profile_id: 'prof-shared' },
    { id: 'ident-b', profile_id: 'prof-shared' },
    { id: 'ident-noprofile', profile_id: null },
  ]
  const leadIdentity = (id: string) => ({ l1: 'ident-lead' } as Record<string, string>)[id]
  const resolve = identityResolver(identities, leadIdentity)
  const e = (sender_profile_id: string | null, lead_id: string | null = 'l1'): PerfEvent =>
    ({ actor_id: 'r', action_type: 'DM_SENT', execution_status: 'sent', lead_id, sender_profile_id })

  it('the identity built on the sending profile owns the event', () => {
    expect(resolve(e('prof-cloud'))).toBe('ident-cloud')
  })
  it('a profile shared by two identities is ambiguous → the lead decides', () => {
    expect(resolve(e('prof-shared'))).toBe('ident-lead')
  })
  it('no sending profile, or one no identity uses → the lead decides', () => {
    expect(resolve(e(null))).toBe('ident-lead')
    expect(resolve(e('prof-unknown'))).toBe('ident-lead')
  })
  it('a raw profile id is never returned as an identity', () => {
    expect(resolve(e('prof-unknown', null))).toBeNull()
  })
})
