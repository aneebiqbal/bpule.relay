import { describe, expect, it } from 'vitest'
import type { DbClient, DbResult } from '@/lib/db/types'
import { createFakeSupabase } from './helpers/fake-supabase'
import { getRepDailyActivity } from '@/lib/performance/activity-model'
import { loadPerformance as loadPerf, PERFORMANCE_EVENT_CEILING } from '@/lib/operations/performance'
import { loadTargets, PERIODS, targetTypeForEvent } from '@/lib/operations/targets'
import { dayKey } from '@/lib/analytics/pipeline-analytics'
import {
  ACTIVITY_EVENT_TYPES,
  PERFORMANCE_EVENT_TYPES,
  TARGET_EVENT_TYPES,
  activityCoverageSql,
  activityDailySql,
  metricCountsFromRow,
  performanceMetricsSql,
  targetProgressSql,
} from '@/lib/analytics/aggregates'

/**
 * Analytics aggregates.
 *
 * The JS authority never moved: `aggregateMetrics` and `canonicalActionFor`
 * still define a send, a reply, a meeting and a win. The Neon path encodes the
 * same rules in GROUP BY statements. These tests run both paths over one
 * fixture and require identical output — the same gate the production export
 * was checked against (0 diffs across every rep, and across org / rep /
 * profile / source scopes).
 */

const ORG = 'org-1'
const REP = 'rep-1'
const REP2 = 'rep-2'

type Raw = Record<string, unknown>

/** A DbClient whose raw() answers the aggregate statements from `answers`. */
function neonClient(seed: Record<string, Raw[]>, answers: {
  actor?: Raw[]
  profile?: Raw[]
  source?: Raw[]
  total?: Raw[]
  daily?: Raw[]
  coverage?: Raw[]
  dayEvents?: Raw[]
}): DbClient {
  const { client } = createFakeSupabase(seed)
  const wrapped = Object.create(client) as DbClient & {
    raw: (sql: string, params?: unknown[]) => Promise<DbResult<Raw[]>>
  }
  wrapped.provider = 'neon'
  wrapped.raw = async (sql: string) => {
    if (sql.includes('MIN(occurred_at)')) return { data: answers.coverage ?? [], error: null }
    if (sql.includes('ORDER BY occurred_at ASC')) return { data: answers.dayEvents ?? [], error: null }
    if (sql.includes('AT TIME ZONE')) return { data: answers.daily ?? [], error: null }
    if (sql.includes('actor_id AS key')) return { data: answers.actor ?? [], error: null }
    if (sql.includes('profile_key AS key')) return { data: answers.profile ?? [], error: null }
    if (sql.includes('source_key AS key')) return { data: answers.source ?? [], error: null }
    if (sql.includes('GROUP BY actor_id, action_type')) return { data: answers.actor ?? [], error: null }
    return { data: answers.total ?? [], error: null }
  }
  return wrapped
}

function metricRow(key: string | null, m: Partial<Record<string, number>>): Raw {
  return {
    key,
    connections: 0,
    messages: 0,
    replies_sent: 0,
    replies: 0,
    meetings: 0,
    proposals: 0,
    wins: 0,
    applications: 0,
    leads_worked: 0,
    leads_contacted: 0,
    leads_replied: 0,
    ...m,
  }
}

// ─── Heatmap ────────────────────────────────────────────────────────────────

const HEAT_EVENTS: Raw[] = [
  { id: 'e1', organization_id: ORG, actor_id: REP, action_type: 'LEAD_EXTRACTED', execution_status: 'generated', lead_id: 'l1', job_id: null, occurred_at: '2026-10-19T12:00:00Z' },
  { id: 'e2', organization_id: ORG, actor_id: REP, action_type: 'CONNECTION_SENT', execution_status: 'sent', lead_id: 'l1', job_id: null, occurred_at: '2026-10-20T10:00:00Z' },
  { id: 'e3', organization_id: ORG, actor_id: REP, action_type: 'CONNECTION_SENT', execution_status: 'sent', lead_id: 'l2', job_id: null, occurred_at: '2026-10-20T11:00:00Z' },
  // 23:30 UTC is already the 21st in Asia/Karachi.
  { id: 'e4', organization_id: ORG, actor_id: REP, action_type: 'DM_SENT', execution_status: 'sent', lead_id: 'l1', job_id: null, occurred_at: '2026-10-20T23:30:00Z' },
  { id: 'e5', organization_id: ORG, actor_id: REP, action_type: 'REPLY_SENT', execution_status: 'failed', lead_id: 'l1', job_id: null, occurred_at: '2026-10-21T10:00:00Z' },
  { id: 'e6', organization_id: ORG, actor_id: REP, action_type: 'RECOMMENDATION_SHOWN', execution_status: 'generated', lead_id: null, job_id: null, occurred_at: '2026-10-21T10:00:00Z' },
  { id: 'e7', organization_id: ORG, actor_id: REP, action_type: 'MEETING_BOOKED', execution_status: 'sent', lead_id: 'l2', job_id: null, occurred_at: '2026-10-21T12:00:00Z' },
  { id: 'e8', organization_id: ORG, actor_id: REP, action_type: 'CLIENT_WON', execution_status: 'generated', lead_id: 'l2', job_id: null, occurred_at: '2026-10-21T13:00:00Z' },
]

const HEAT_RANGE = { startDate: new Date('2026-10-19T00:00:00Z'), endDate: new Date('2026-10-21T18:00:00Z') }

function heatSupabase(): DbClient {
  const { client } = createFakeSupabase({ action_events: HEAT_EVENTS })
  return client as unknown as DbClient
}

describe('HEATMAP_SQL_JS_PARITY', () => {
  it('produces the same daily breakdown, summary and coverage from grouped rows', async () => {
    const sql = neonClient({ action_events: HEAT_EVENTS }, {
      daily: [
        { day: '2026-10-19', action_type: 'LEAD_EXTRACTED', n: 1 },
        { day: '2026-10-20', action_type: 'CONNECTION_SENT', n: 2 },
        { day: '2026-10-21', action_type: 'DM_SENT', n: 1 },
        { day: '2026-10-21', action_type: 'MEETING_BOOKED', n: 1 },
        { day: '2026-10-21', action_type: 'CLIENT_WON', n: 1 },
      ],
      coverage: [{ coverage_start: '2026-10-19T12:00:00Z' }],
    })

    const [fromSql, fromEvents] = await Promise.all([
      getRepDailyActivity({ repId: REP, orgId: ORG, timezone: 'Asia/Karachi', supabase: sql, ...HEAT_RANGE }),
      getRepDailyActivity({ repId: REP, orgId: ORG, timezone: 'Asia/Karachi', supabase: heatSupabase(), ...HEAT_RANGE }),
    ])

    expect(fromSql.daily).toEqual(fromEvents.daily)
    expect(fromSql.summary).toEqual(fromEvents.summary)
    expect(fromSql.dataCoverageStart).toBe(fromEvents.dataCoverageStart)
    expect(fromSql.rangeStart).toBe('2026-10-19')
    expect(fromSql.rangeEnd).toBe('2026-10-21')
  })

  it('counts exactly the canonical executed work', async () => {
    const result = await getRepDailyActivity({ repId: REP, orgId: ORG, timezone: 'Asia/Karachi', supabase: heatSupabase(), ...HEAT_RANGE })
    const byDate = new Map(result.daily.map((d) => [d.date, d]))

    expect(byDate.get('2026-10-19')).toMatchObject({
      totalActions: 1, active: true, breakdown: { leadsAnalyzed: 1 },
    })
    expect(byDate.get('2026-10-20')).toMatchObject({
      totalActions: 2, active: true, breakdown: { connections: 2 },
    })
    const d21 = byDate.get('2026-10-21')
    expect(d21).toMatchObject({
      totalActions: 3,
      active: true,
      breakdown: { firstDMs: 1, meetings: 1, wins: 1, replies: 0 },
    })
    // The failed reply and the unmapped recommendation never appear.
    expect(result.summary.totalActions).toBe(6)
    expect(result.summary.breakdown).toEqual({
      leadsAnalyzed: 1, leadsSaved: 0, connections: 2, firstDMs: 1,
      followups: 0, replies: 0, upworkApplications: 0, meetings: 1, wins: 1, referrals: 0,
    })
  })

  it('loads raw events for the clicked day only', async () => {
    const sql = neonClient({ action_events: HEAT_EVENTS }, {
      daily: [
        { day: '2026-10-19', action_type: 'LEAD_EXTRACTED', n: 1 },
        { day: '2026-10-20', action_type: 'CONNECTION_SENT', n: 2 },
        { day: '2026-10-21', action_type: 'DM_SENT', n: 1 },
        { day: '2026-10-21', action_type: 'MEETING_BOOKED', n: 1 },
        { day: '2026-10-21', action_type: 'CLIENT_WON', n: 1 },
      ],
      coverage: [{ coverage_start: '2026-10-19T12:00:00Z' }],
      dayEvents: [HEAT_EVENTS[1], HEAT_EVENTS[2]],
    })
    const result = await getRepDailyActivity({
      repId: REP, orgId: ORG, timezone: 'Asia/Karachi', supabase: sql, includeEventsForDate: '2026-10-20', ...HEAT_RANGE,
    })
    const byDate = new Map(result.daily.map((d) => [d.date, d]))
    expect(byDate.get('2026-10-20')?.events.map((e) => e.id)).toEqual(['e2', 'e3'])
    expect(byDate.get('2026-10-21')?.events).toEqual([])
    expect(byDate.get('2026-10-19')?.events).toEqual([])
  })

  it('falls back to the raw read when the aggregate fails', async () => {
    const { client } = createFakeSupabase({ action_events: HEAT_EVENTS })
    const failing = Object.create(client) as DbClient & { raw: () => Promise<DbResult<Raw[]>> }
    failing.provider = 'neon'
    failing.raw = async () => ({ data: null, error: { message: 'boom' } })
    const result = await getRepDailyActivity({ repId: REP, orgId: ORG, timezone: 'Asia/Karachi', supabase: failing, ...HEAT_RANGE })
    expect(result.summary.totalActions).toBe(6)
  })
})

describe('HEATMAP_TIMEZONE_PARITY', () => {
  it('renders the same calendar day as Intl on the zone boundaries', () => {
    const { sql, params } = activityDailySql({ orgId: ORG, repId: REP, start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z', timezone: 'Asia/Karachi' })
    expect(sql).toContain('(occurred_at AT TIME ZONE ?)::date')
    expect(params[0]).toBe('Asia/Karachi')
    // 23:30 UTC is the next day in Karachi; 18:59:59 UTC is still the same day.
    expect(dayKey('2026-10-17T23:30:00Z', 'Asia/Karachi')).toBe('2026-10-18')
    expect(dayKey('2026-10-17T18:59:59Z', 'Asia/Karachi')).toBe('2026-10-17')
  })

  it('scopes by organization and rep and excludes failed work', () => {
    const { sql, params } = activityDailySql({ orgId: ORG, repId: REP, start: 'a', end: 'b', timezone: 'UTC' })
    expect(sql).toContain('organization_id = ?')
    expect(sql).toContain('actor_id = ?')
    expect(sql).toContain("execution_status IS DISTINCT FROM 'failed'")
    expect(params).toEqual(['UTC', ORG, REP, 'a', 'b'])
    for (const type of ACTIVITY_EVENT_TYPES) expect(sql).toContain(`'${type}'`)
  })

  it('reads coverage before the canonical filter, so an unmapped first event still counts', () => {
    const { sql } = activityCoverageSql({ orgId: ORG, repId: REP, start: 'a', end: 'b' })
    expect(sql).not.toContain('action_type IN')
    expect(sql).not.toContain('execution_status')
  })
})

// ─── Performance ────────────────────────────────────────────────────────────

const PERF_EVENTS: Raw[] = [
  { id: 'p1', organization_id: ORG, actor_id: REP, action_type: 'CONNECTION_SENT', execution_status: 'sent', lead_id: 'l1', sender_profile_id: 'prof-1', occurred_at: '2026-10-20T09:00:00Z' },
  { id: 'p2', organization_id: ORG, actor_id: REP, action_type: 'DM_SENT', execution_status: 'sent', lead_id: 'l1', sender_profile_id: 'prof-1', occurred_at: '2026-10-20T10:00:00Z' },
  { id: 'p3', organization_id: ORG, actor_id: REP, action_type: 'REPLY_SENT', execution_status: 'sent', lead_id: 'l1', sender_profile_id: 'prof-1', occurred_at: '2026-10-20T11:00:00Z' },
  { id: 'p4', organization_id: ORG, actor_id: REP, action_type: 'REPLY_RECEIVED', execution_status: 'delivered', lead_id: 'l1', sender_profile_id: null, occurred_at: '2026-10-20T12:00:00Z' },
  { id: 'p5', organization_id: ORG, actor_id: REP2, action_type: 'CONNECTION_SENT', execution_status: 'failed', lead_id: 'l2', sender_profile_id: null, occurred_at: '2026-10-20T09:00:00Z' },
  { id: 'p6', organization_id: ORG, actor_id: REP2, action_type: 'FOLLOWUP_SENT', execution_status: 'sent', lead_id: 'l2', sender_profile_id: null, occurred_at: '2026-10-20T10:00:00Z' },
  { id: 'p7', organization_id: ORG, actor_id: REP2, action_type: 'MEETING_BOOKED', execution_status: 'sent', lead_id: 'l2', sender_profile_id: null, occurred_at: '2026-10-20T11:00:00Z' },
  { id: 'p8', organization_id: ORG, actor_id: REP2, action_type: 'CLIENT_WON', execution_status: 'generated', lead_id: 'l2', sender_profile_id: null, occurred_at: '2026-10-20T12:00:00Z' },
  { id: 'p9', organization_id: ORG, actor_id: REP2, action_type: 'UPWORK_PROPOSAL_PREPARED', execution_status: 'generated', lead_id: 'l2', sender_profile_id: null, occurred_at: '2026-10-20T13:00:00Z' },
  // No lead: the source falls back to the event's own channel.
  { id: 'p10', organization_id: ORG, actor_id: REP2, action_type: 'UPWORK_APPLIED', execution_status: 'sent', lead_id: null, sender_profile_id: null, occurred_at: '2026-10-20T14:00:00Z' },
]

const PERF_LEADS: Raw[] = [
  { id: 'l1', organization_id: ORG, owner_rep_id: REP, status: 'replied', source: 'linkedin', revenue_identity_id: 'ri1', is_test: false, canonical_score: 80, created_at: '2026-10-01T00:00:00Z' },
  { id: 'l2', organization_id: ORG, owner_rep_id: REP2, status: 'contacted', source: 'upwork', revenue_identity_id: 'ri2', is_test: false, canonical_score: 20, created_at: '2026-10-01T00:00:00Z' },
]

const PERF_IDENTITIES: Raw[] = [
  { id: 'ri1', organization_id: ORG, profile_id: 'prof-1', identity_name: 'LinkedIn' },
  { id: 'ri2', organization_id: ORG, profile_id: null, identity_name: 'Upwork' },
]

const PERF_REPS: Raw[] = [
  { id: REP, organization_id: ORG, name: 'Ada' },
  { id: REP2, organization_id: ORG, name: 'Ben' },
]

const PERF_STATES: Raw[] = [
  { lead_id: 'l1', stage: 'replied', last_sent_at: '2026-10-20T11:00:00Z', last_reply_at: '2026-10-20T12:00:00Z', won_at: null },
  { lead_id: 'l2', stage: 'contacted', last_sent_at: '2026-10-20T10:00:00Z', last_reply_at: null, won_at: null },
]

const PERF_SEED = {
  action_events: PERF_EVENTS,
  leads: PERF_LEADS,
  revenue_identities: PERF_IDENTITIES,
  reps: PERF_REPS,
  conversation_states: PERF_STATES,
  task_events: [],
}

const PERF_WINDOW = { start: '2026-10-01T00:00:00.000Z', end: '2026-11-01T00:00:00.000Z' }
const PERF_QUERY = { orgId: ORG, repIds: null, start: PERF_WINDOW.start, end: PERF_WINDOW.end }

/** The grouped rows the SQL returns for PERF_EVENTS. */
const PERF_ACTOR_ROWS = [
  metricRow(REP, { connections: 1, messages: 2, replies_sent: 1, replies: 1, leads_worked: 1, leads_contacted: 1, leads_replied: 1 }),
  metricRow(REP2, { messages: 1, meetings: 1, proposals: 1, wins: 1, applications: 1, leads_worked: 1, leads_contacted: 1 }),
]
const PERF_PROFILE_ROWS = [
  metricRow('ri1', { connections: 1, messages: 2, replies_sent: 1, replies: 1, leads_worked: 1, leads_contacted: 1, leads_replied: 1 }),
  metricRow('ri2', { messages: 1, meetings: 1, proposals: 1, wins: 1, leads_worked: 1, leads_contacted: 1 }),
  metricRow('none', { applications: 1 }),
]
const PERF_SOURCE_ROWS = [
  metricRow('linkedin', { connections: 1, messages: 2, replies_sent: 1, replies: 1, leads_worked: 1, leads_contacted: 1, leads_replied: 1 }),
  metricRow('upwork', { messages: 1, meetings: 1, proposals: 1, wins: 1, applications: 1, leads_worked: 1, leads_contacted: 1 }),
]
const PERF_TOTAL_ROW = metricRow(null, {
  connections: 1, messages: 3, replies_sent: 1, replies: 1, meetings: 1,
  proposals: 1, wins: 1, applications: 1, leads_worked: 2, leads_contacted: 2, leads_replied: 1,
})

function perfSupabase(): DbClient {
  const { client } = createFakeSupabase(PERF_SEED)
  return client as unknown as DbClient
}

function perfNeon(answers: { actor?: Raw[]; profile?: Raw[]; source?: Raw[]; total?: Raw[] }): DbClient {
  return neonClient(PERF_SEED, answers)
}

describe('PERFORMANCE_SQL_JS_PARITY', () => {
  it('returns identical totals, rep, profile and source rows from grouped aggregates', async () => {
    const [fromSql, fromEvents] = await Promise.all([
      loadPerf(perfNeon({
        actor: PERF_ACTOR_ROWS, profile: PERF_PROFILE_ROWS, source: PERF_SOURCE_ROWS, total: [PERF_TOTAL_ROW],
      }), PERF_QUERY),
      loadPerf(perfSupabase(), PERF_QUERY),
    ])

    expect(fromSql.totals).toEqual(fromEvents.totals)
    expect(fromSql.byRep).toEqual(fromEvents.byRep)
    expect(fromSql.byProfile).toEqual(fromEvents.byProfile)
    expect(fromSql.bySource).toEqual(fromEvents.bySource)
    expect(fromSql.funnel).toEqual(fromEvents.funnel)
    expect(fromSql.truncated).toBe(fromEvents.truncated)
  })

  it('keeps a rep with tasks but no events in the comparison', async () => {
    const fromEvents = await loadPerf(perfSupabase(), PERF_QUERY)
    const fromSql = await loadPerf(perfNeon({
      actor: PERF_ACTOR_ROWS, profile: PERF_PROFILE_ROWS, source: PERF_SOURCE_ROWS, total: [PERF_TOTAL_ROW],
    }), PERF_QUERY)
    expect(fromSql.byRep.map((r) => r.repId)).toEqual(fromEvents.byRep.map((r) => r.repId))
  })

  it('falls back to the event read when an aggregate statement fails', async () => {
    const { client } = createFakeSupabase(PERF_SEED)
    const failing = Object.create(client) as DbClient & { raw: () => Promise<DbResult<Raw[]>> }
    failing.provider = 'neon'
    failing.raw = async () => ({ data: null, error: { message: 'boom' } })
    const result = await loadPerf(failing, PERF_QUERY)
    expect(result.totals.connections).toBe(1)
    expect(result.totals.wins).toBe(1)
  })

  it('uses the Supabase read path untouched when the provider has no raw SQL', async () => {
    const { client } = createFakeSupabase(PERF_SEED)
    const supabase = client as unknown as DbClient
    const result = await loadPerf(supabase, PERF_QUERY)
    expect(result.totals.messages).toBe(3)
  })
})

describe('PERFORMANCE_SEND_TRUTH', () => {
  it('never counts a failed or draft send, and REPLY_SENT is a message but not a contact', async () => {
    const result = await loadPerf(perfSupabase(), PERF_QUERY)
    expect(result.totals).toMatchObject({
      connections: 1,        // REP2's failed connection does not count
      messages: 3,
      repliesSent: 1,
      replies: 1,
      leadsContacted: 2,     // CONNECTION_SENT + FOLLOWUP_SENT leads; REPLY_SENT adds none
      leadsReplied: 1,
    })
    const ada = result.byRep.find((r) => r.repId === REP)!
    expect(ada.metrics.leadsContacted).toBe(1)
    expect(ada.metrics.leadsWorked).toBe(1)
  })

  it('counts a meeting and a win as separate outcomes', () => {
    expect(targetTypeForEvent('MEETING_BOOKED', 'sent')).toBe('MEETINGS')
    expect(targetTypeForEvent('CLIENT_WON', 'generated')).toBeNull()
    expect(targetTypeForEvent('MEETING_BOOKED', 'failed')).toBeNull()
  })
})

describe('PERFORMANCE_AGGREGATE_SCOPE', () => {
  it('applies the rep filter inside the aggregate, never after it', async () => {
    const { sql, params } = performanceMetricsSql('actor', { orgId: ORG, repIds: [REP], start: 'a', end: 'b' })
    expect(sql).toContain('e.actor_id IN (?)')
    expect(params).toEqual([ORG, 'a', 'b', REP, ORG, ORG])
  })

  it('applies profile and source filters to every grouping, before grouping', () => {
    const { sql, params } = performanceMetricsSql('profile', {
      orgId: ORG, repIds: [REP], start: 'a', end: 'b', profileId: 'ri1', source: 'linkedin',
    })
    expect(sql).toContain('profile_key = ?')
    expect(sql).toContain('source_key = ?')
    expect(params).toEqual([ORG, 'a', 'b', REP, ORG, ORG, 'ri1', 'linkedin'])
  })

  it('excludes failed work and keeps the canonical vocabulary', () => {
    const { sql } = performanceMetricsSql('total', { orgId: ORG, repIds: null, start: 'a', end: 'b' })
    expect(sql).toContain("execution_status IS DISTINCT FROM 'failed'")
    expect(sql).toContain("'MEETING_BOOKED'")
    expect(sql).toContain("'CLIENT_WON'")
    for (const type of PERFORMANCE_EVENT_TYPES) expect(sql).toContain(`'${type}'`)
  })
})

describe('PERFORMANCE_FUNNEL_SEMANTICS', () => {
  it('is furthest-known-stage, not a claimed conversion', async () => {
    const result = await loadPerf(perfSupabase(), PERF_QUERY)
    expect(result.funnel.map((s) => `${s.key}:${s.count}`)).toEqual([
      'lead:2', 'contact:2', 'reply:1', 'meeting:0', 'proposal:0', 'won:0',
    ])
    // No step claims more than the step before it.
    for (let i = 1; i < result.funnel.length; i += 1) {
      expect(result.funnel[i].count).toBeLessThanOrEqual(result.funnel[i - 1].count)
    }
  })

  it('reports the cohort cap, not a fabricated total', () => {
    expect(PERFORMANCE_EVENT_CEILING).toBe(50_000)
  })
})

describe('PERFORMANCE_TARGETS_EVENT_PARITY', () => {
  it('expands the grouped target rows back to the same counts as a raw read', async () => {
    const { sql, params } = targetProgressSql({ orgId: ORG, repIds: [REP, REP2], start: PERF_WINDOW.start, end: PERF_WINDOW.end })
    expect(sql).toContain('GROUP BY actor_id, action_type')
    expect(params).toEqual([ORG, PERF_WINDOW.start, PERF_WINDOW.end, REP, REP2])

    const raw = await loadTargets(perfSupabase(), {
      orgId: ORG,
      reps: [{ id: REP, name: 'Ada' }, { id: REP2, name: 'Ben' }],
      teams: [],
      period: PERIODS[2].value,
      window: PERF_WINDOW,
      elapsedShare: 0.5,
    })
    const grouped = await loadTargets(perfNeon({
      actor: [
        { key: REP, action_type: 'CONNECTION_SENT', n: 1 },
        { key: REP, action_type: 'DM_SENT', n: 1 },
        { key: REP, action_type: 'REPLY_SENT', n: 1 },
        { key: REP2, action_type: 'FOLLOWUP_SENT', n: 1 },
        { key: REP2, action_type: 'MEETING_BOOKED', n: 1 },
        { key: REP2, action_type: 'UPWORK_PROPOSAL_PREPARED', n: 1 },
        { key: REP2, action_type: 'UPWORK_APPLIED', n: 1 },
      ],
    }), {
      orgId: ORG,
      reps: [{ id: REP, name: 'Ada' }, { id: REP2, name: 'Ben' }],
      teams: [],
      period: PERIODS[2].value,
      window: PERF_WINDOW,
      elapsedShare: 0.5,
    })

    expect(grouped.reps).toEqual(raw.reps)
    expect(grouped.truncated).toBe(false)
  })

  it('keeps only canonical target types', () => {
    const { sql } = targetProgressSql({ orgId: ORG, repIds: null, start: 'a', end: 'b' })
    for (const type of TARGET_EVENT_TYPES) expect(sql).toContain(`'${type}'`)
    expect(sql).not.toContain("'REPLY_RECEIVED'")
  })
})

describe('metricCountsFromRow', () => {
  it('maps snake_case SQL columns onto the canonical metric names', () => {
    expect(metricCountsFromRow(metricRow('k', { replies_sent: 2, leads_worked: 3 }))).toEqual({
      connections: 0, messages: 0, repliesSent: 2, replies: 0, meetings: 0,
      proposals: 0, wins: 0, applications: 0, leadsWorked: 3, leadsContacted: 0, leadsReplied: 0,
    })
  })

  it('treats a missing row as zero, never as an error', () => {
    expect(metricCountsFromRow({}).connections).toBe(0)
  })
})
