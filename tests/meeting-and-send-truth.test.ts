/**
 * Slice B canonical truth contracts:
 *   MEETING_PARITY  — every surface counts meetings/wins from the same events
 *   MEETING_IS_NOT_A_WIN — recording a meeting never records a win
 *   DRAFT_NOT_SENT  — drafts and failures never count as sends
 * Synthetic fixtures only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countMeetingEvents, countWinEvents, outcomeEventsByActor } from '@/lib/sales/meetings'
import { aggregateMetrics, type PerfEvent } from '@/lib/operations/performance'
import { canonicalActionFor } from '@/lib/performance/activity-model'
import { assembleManagerRepSnapshots } from '@/lib/team/manager-home-summary'
import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { TeamLivePayload } from '@/lib/admin/team-live'

const events: PerfEvent[] = [
  { actor_id: 'r1', action_type: 'MEETING_BOOKED', execution_status: 'sent', lead_id: 'l1' },
  { actor_id: 'r1', action_type: 'MEETING_BOOKED', execution_status: 'sent', lead_id: 'l2' },
  { actor_id: 'r2', action_type: 'MEETING_BOOKED', execution_status: 'failed', lead_id: 'l3' },
  { actor_id: 'r2', action_type: 'CLIENT_WON', execution_status: 'sent', lead_id: 'l4' },
  { actor_id: 'r2', action_type: 'DM_SENT', execution_status: 'sent', lead_id: 'l4' },
]

const day: TeamDaySummary = {
  businessDate: '2026-11-01', timezone: 'UTC', isWorkingDay: true, workdayProgress: 0.5, minutesRemaining: 200,
  workdayStart: '09:00', workdayEnd: '18:00',
  counts: { NOT_STARTED: 0, ACTIVE: 2, AT_RISK: 0, CRITICAL: 0, READY_TO_CLOSE: 0, CLOSED: 0, MISSED: 0 },
  totals: { reps: 2, requiredRemaining: 0, commitmentProgress: 0.5, repliesWaiting: 0, actionsToday: 0, pipelineCreated: 0 },
  reps: ['r1', 'r2'].map((repId) => ({
    repId, repName: repId, repRole: 'rep', state: 'ACTIVE' as const, checkInAt: null, closedAt: null, lateStart: false,
    exceptionState: 'NONE', commitmentProgress: 0.5, requiredRemaining: 0, minutesRemaining: 100, repliesWaiting: 0,
    actionsToday: 0, pipelineCreated: 0, lastActivityAt: null, identities: [],
  })),
}

// Goals claim 9 meetings — self-reported completions must not override events.
const liveWithGoals: TeamLivePayload = {
  date: '2026-11-01',
  people: ['r1', 'r2'].map((repId) => ({
    repId, repName: repId, role: 'rep', identities: [], openLeads: [], openLeadCount: 0, outreachSent: 0,
    repliesHandled: 0, leadsSaved: 0, extractionsCount: 0, extractionFailures: 0, totalTarget: 0, totalCompleted: 0,
    totalRemaining: 0, lastActivityAt: null, identityCount: 0,
    goals: [{ activityType: 'meetings', label: 'Meetings', target: 10, completed: 9, remaining: 1, identityId: 'i' }],
  })),
}

describe('MEETING_PARITY', () => {
  it('MEETING_PARITY_SAME_EVENTS: homes, team performance and activity model agree', () => {
    const byActor = outcomeEventsByActor(events)
    const snaps = assembleManagerRepSnapshots({
      teamDay: day,
      teamLive: liveWithGoals,
      allowedRepIds: new Set(['r1', 'r2']),
      outcomeEventsByRep: byActor,
    })
    const homeMeetings = snaps.reduce((s, r) => s + r.meetings, 0)
    const homeWins = snaps.reduce((s, r) => s + r.wins, 0)
    const perf = aggregateMetrics(events)
    const activityModelMeetings = events.filter((e) => canonicalActionFor(e.action_type, e.execution_status) === 'MEETING_BOOKED').length

    expect(countMeetingEvents(events)).toBe(2)
    expect(homeMeetings).toBe(2)
    expect(perf.meetings).toBe(2)
    expect(activityModelMeetings).toBe(2)
    expect(homeWins).toBe(countWinEvents(events))
    expect(perf.wins).toBe(1)
  })

  it('MEETING_PARITY_PER_REP: per-rep counts match, goals never override events', () => {
    const snaps = assembleManagerRepSnapshots({
      teamDay: day,
      teamLive: liveWithGoals,
      allowedRepIds: new Set(['r1', 'r2']),
      outcomeEventsByRep: outcomeEventsByActor(events),
    })
    expect(snaps.find((s) => s.repId === 'r1')).toMatchObject({ meetings: 2, wins: 0 })
    expect(snaps.find((s) => s.repId === 'r2')).toMatchObject({ meetings: 0, wins: 1 })
  })

  it('MEETING_PARITY_NO_EVENTS: a rep with no events has zero, not their goal number', () => {
    const snaps = assembleManagerRepSnapshots({
      teamDay: day,
      teamLive: liveWithGoals,
      allowedRepIds: new Set(['r1', 'r2']),
      outcomeEventsByRep: new Map(),
    })
    expect(snaps.every((s) => s.meetings === 0 && s.wins === 0)).toBe(true)
  })
})

// ─── MEETING_IS_NOT_A_WIN: the status route ─────────────────────────────────

const emitAction = vi.fn(async () => undefined)
const updateLeadStatus = vi.fn(async () => undefined)
const upsertConversationState = vi.fn(async () => undefined)

vi.mock('@/lib/action-ledger', () => ({ emitAction: (...args: unknown[]) => emitAction(...(args as [])) }))
vi.mock('@/lib/dataset/service', () => ({
  findLatestSampleForLead: vi.fn(async () => null),
  captureOutcome: vi.fn(async () => undefined),
}))
vi.mock('@/lib/store', () => ({
  createScoutStore: vi.fn(async () => ({
    getLead: vi.fn(async () => ({ id: 'l1', organizationId: 'org', ownerRepId: 'r1', senderProfileId: null, status: 'replied' })),
    updateLeadStatus,
    upsertConversationState,
    getSupabaseClient: () => ({}),
  })),
}))

describe('MEETING_IS_NOT_A_WIN', () => {
  beforeEach(() => {
    emitAction.mockClear()
    updateLeadStatus.mockClear()
    upsertConversationState.mockClear()
  })

  it('meeting_booked sets the meeting stage, emits MEETING_BOOKED and leaves the lead status alone', async () => {
    const { POST } = await import('@/app/api/leads/[id]/status/route')
    const res = await POST(
      new Request('http://x/api/leads/l1/status', { method: 'POST', body: JSON.stringify({ status_type: 'meeting_booked' }) }),
      { params: Promise.resolve({ id: 'l1' }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lead_status).toBe('replied')
    expect(updateLeadStatus).not.toHaveBeenCalled()
    expect(upsertConversationState).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'l1', stage: 'meeting' }))
    const types = emitAction.mock.calls.map((c) => (c as unknown as [{ actionType: string }])[0].actionType)
    expect(types).toEqual(['MEETING_BOOKED'])
    expect(types).not.toContain('CLIENT_WON')
  })
})

// ─── DRAFT_NOT_SENT ─────────────────────────────────────────────────────────

describe('DRAFT_NOT_SENT', () => {
  it('activity model: drafts, prepared proposals and failures are not activity', () => {
    expect(canonicalActionFor('CONNECTION_PREPARED')).toBeNull()
    expect(canonicalActionFor('DM_PREPARED')).toBeNull()
    expect(canonicalActionFor('UPWORK_PROPOSAL_PREPARED')).toBeNull()
    expect(canonicalActionFor('DM_SENT', 'failed')).toBeNull()
    expect(canonicalActionFor('CONNECTION_SENT', 'sent')).toBe('CONNECTION_SENT')
    expect(canonicalActionFor('DM_SENT', 'generated')).toBe('FIRST_DM_SENT')
  })

  it('personal /performance and Team Performance count the same sends', () => {
    const raw: PerfEvent[] = [
      { actor_id: 'r1', action_type: 'CONNECTION_PREPARED', execution_status: 'generated', lead_id: 'a' },
      { actor_id: 'r1', action_type: 'CONNECTION_SENT', execution_status: 'sent', lead_id: 'a' },
      { actor_id: 'r1', action_type: 'DM_PREPARED', execution_status: 'generated', lead_id: 'b' },
      { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'failed', lead_id: 'b' },
      { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'sent', lead_id: 'b' },
    ]
    const team = aggregateMetrics(raw)
    const personalConnections = raw.filter((e) => canonicalActionFor(e.action_type, e.execution_status) === 'CONNECTION_SENT').length
    const personalDms = raw.filter((e) => canonicalActionFor(e.action_type, e.execution_status) === 'FIRST_DM_SENT').length
    expect(team.connections).toBe(1)
    expect(personalConnections).toBe(1)
    expect(team.messages).toBe(1)
    expect(personalDms).toBe(1)
  })
})
