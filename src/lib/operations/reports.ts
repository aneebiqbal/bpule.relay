import type { DbClient } from '@/lib/db/types'
/**
 * Reports (Phase 8 / Slice C) — aggregate-first.
 *
 * Every number is a zero-row COUNT request (`head: true, count: 'exact'`):
 * the database counts, nothing is downloaded. Rep / team / profile / source
 * filters apply through an inner join to `leads` (or `actor_id` on events),
 * scoped by server-side operational scope.
 *
 * PostgREST cannot GROUP BY without an RPC (a migration), so per-rep tables
 * (Team report) still use the bounded event read in performance.ts; that is
 * labelled in the UI and listed in docs/RELAY_OPERATIONS_EGRESS_AUDIT.md.
 */
import { QUALIFICATION_BANDS } from '@/lib/scoring/qualification'
import { MEETING_EVENT, WIN_EVENT } from '@/lib/sales/meetings'
import { CONNECTION_EVENTS, SENT_MESSAGE_EVENTS } from '@/lib/sales/send-truth'
import type { OpsSource } from '@/lib/operations/filters'

export const QUALIFIED_MIN_SCORE = QUALIFICATION_BANDS.find((b) => b.qualification === 'WORTH_PURSUING')!.min

export interface ReportScope {
  orgId: string
  /** null = organization. [] = nothing. */
  repIds: string[] | null
  profileId?: string | null
  source?: OpsSource | null
}

export interface CountStep {
  key: string
  label: string
  count: number | null
  /** Percent of the previous step; null for the first step or an empty / unknown previous step. */
  conversionPct: number | null
  /** Same metric in the previous window of equal length; null when unavailable. */
  previous: number | null
  href: string | null
}

/** Pure: attach step conversion to an ordered list of counts. Unknown counts never convert. */
export function withConversion<T extends { count: number | null }>(steps: T[]): Array<T & { conversionPct: number | null }> {
  return steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].count : null
    return {
      ...s,
      conversionPct: i === 0 || prev === null || prev === 0 || s.count === null ? null : Math.round((s.count / prev) * 100),
    }
  })
}

/** Pure: change vs previous window. Only shown when both sides are known and the previous is non-zero. */
export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export function previousWindow(start: string, end: string): { start: string; end: string } {
  const s = Date.parse(start)
  const e = Date.parse(end)
  const len = e - s
  return { start: new Date(s - len).toISOString(), end: new Date(s).toISOString() }
}

// ─── count primitives ───────────────────────────────────────────────────────

type CountQuery = PromiseLike<{ count?: number | null; error: unknown }>

async function run(q: CountQuery): Promise<number | null> {
  const { count, error } = await q
  if (error) return null
  return count ?? 0
}

/** Leads created in [start, end) matching an extra predicate. */
function leadCount(
  client: DbClient,
  scope: ReportScope,
  window: { start: string; end: string },
  extra: (q: any) => any = (q) => q, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number | null> {
  if (scope.repIds && scope.repIds.length === 0) return Promise.resolve(0)
  let q = client
    .from('leads')
    .select('id', { head: true, count: 'exact' })
    .eq('organization_id', scope.orgId)
    .eq('is_test', false)
    .gte('created_at', window.start)
    .lt('created_at', window.end)
  if (scope.repIds) q = q.in('owner_rep_id', scope.repIds)
  if (scope.profileId) q = q.eq('revenue_identity_id', scope.profileId)
  if (scope.source === 'linkedin' || scope.source === 'upwork') q = q.eq('source', scope.source)
  if (scope.source === 'other') q = q.not('source', 'in', '(linkedin,upwork)')
  return run(extra(q))
}

/**
 * Resolve the lead ids a report scope selects.
 *
 * The report queries used to express this as a PostgREST embed (`leads!inner`)
 * with filters on the embedded columns, which the Neon adapter cannot
 * translate. Resolving the lead ids first keeps the same inner-join semantics:
 * only conversation states / events whose lead matches are counted.
 */
async function matchingLeadIds(
  client: DbClient,
  scope: ReportScope,
  leadWindow: { start: string; end: string } | null,
  extra: (q: any) => any = (q) => q, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<string[] | null> {
  let q = client
    .from('leads')
    .select('id')
    .eq('organization_id', scope.orgId)
    .eq('is_test', false)
  if (leadWindow) q = q.gte('created_at', leadWindow.start).lt('created_at', leadWindow.end)
  if (scope.repIds) q = q.in('owner_rep_id', scope.repIds)
  if (scope.profileId) q = q.eq('revenue_identity_id', scope.profileId)
  if (scope.source === 'linkedin' || scope.source === 'upwork') q = q.eq('source', scope.source)
  if (scope.source === 'other') q = q.not('source', 'in', '(linkedin,upwork)')
  const { data, error } = await extra(q)
  if (error) return null
  return (data ?? []).map((r: { id: string }) => r.id)
}

/** conversation_states joined to leads (scope filters on the lead). */
function stateCount(
  client: DbClient,
  scope: ReportScope,
  leadWindow: { start: string; end: string } | null,
  extra: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number | null> {
  if (scope.repIds && scope.repIds.length === 0) return Promise.resolve(0)
  return (async () => {
    const leadIds = await matchingLeadIds(client, scope, leadWindow, (q) => q.eq('archived', false))
    if (leadIds === null) return null
    if (leadIds.length === 0) return 0
    const q = client
      .from('conversation_states')
      .select('lead_id', { head: true, count: 'exact' })
      .eq('organization_id', scope.orgId)
      .in('lead_id', leadIds)
    return run(extra(q))
  })()
}

/**
 * Action events in [start, end). Without profile/source filters no lead is
 * required (Upwork applications have none); with them the event must join a
 * matching lead.
 */
function eventCount(
  client: DbClient,
  scope: ReportScope,
  window: { start: string; end: string },
  types: string[],
): Promise<number | null> {
  if (scope.repIds && scope.repIds.length === 0) return Promise.resolve(0)
  const needsLead = Boolean(scope.profileId || scope.source)
  if (!needsLead) {
    return (async () => {
      const { count, error } = await client
        .from('action_events')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', scope.orgId)
        .in('action_type', types)
        .neq('execution_status', 'failed')
        .gte('occurred_at', window.start)
        .lt('occurred_at', window.end)
        .in('actor_id', scope.repIds ?? [])
      if (error) return null
      return count ?? 0
    })()
  }
  return (async () => {
    const leadIds = await matchingLeadIds(client, scope, null)
    if (leadIds === null) return null
    if (leadIds.length === 0) return 0
    const { count, error } = await client
      .from('action_events')
      .select('id', { head: true, count: 'exact' })
      .eq('organization_id', scope.orgId)
      .in('action_type', types)
      .neq('execution_status', 'failed')
      .gte('occurred_at', window.start)
      .lt('occurred_at', window.end)
      .in('actor_id', scope.repIds ?? [])
      .in('lead_id', leadIds)
    if (error) return null
    return count ?? 0
  })()
}

// ─── Sales report ───────────────────────────────────────────────────────────

const MEETING_OR_LATER = ['meeting', 'proposal', 'negotiation', 'won']
const PROPOSAL_OR_LATER = ['proposal', 'negotiation', 'won']

export interface SalesReport {
  /** Cohort: leads created in the window, counted at their furthest known stage. */
  cohort: CountStep[]
  /** Activity in the window (events), regardless of when the lead was created. */
  activity: CountStep[]
}

async function cohortCounts(client: DbClient, scope: ReportScope, w: { start: string; end: string }) {
  const [leads, qualified, contacted, replied, meeting, proposal, won] = await Promise.all([
    leadCount(client, scope, w),
    leadCount(client, scope, w, (q) => q.gte('canonical_score', QUALIFIED_MIN_SCORE)),
    stateCount(client, scope, w, (q) => q.not('last_sent_at', 'is', null)),
    stateCount(client, scope, w, (q) => q.not('last_reply_at', 'is', null)),
    stateCount(client, scope, w, (q) => q.in('stage', MEETING_OR_LATER)),
    stateCount(client, scope, w, (q) => q.in('stage', PROPOSAL_OR_LATER)),
    stateCount(client, scope, w, (q) => q.not('won_at', 'is', null)),
  ])
  return { leads, qualified, contacted, replied, meeting, proposal, won }
}

async function activityCounts(client: DbClient, scope: ReportScope, w: { start: string; end: string }) {
  const [connections, messages, replies, meetings, proposals, wins] = await Promise.all([
    eventCount(client, scope, w, [...CONNECTION_EVENTS]),
    eventCount(client, scope, w, [...SENT_MESSAGE_EVENTS]),
    eventCount(client, scope, w, ['REPLY_RECEIVED']),
    eventCount(client, scope, w, [MEETING_EVENT]),
    eventCount(client, scope, w, ['UPWORK_PROPOSAL_PREPARED']),
    eventCount(client, scope, w, [WIN_EVENT]),
  ])
  return { connections, messages, replies, meetings, proposals, wins }
}

export async function loadSalesReport(
  client: DbClient,
  scope: ReportScope,
  window: { start: string; end: string },
  links: { leads: string; chats: (stage: string) => string; activity: (event: string) => string },
): Promise<SalesReport> {
  const prev = previousWindow(window.start, window.end)
  const [cur, before, act, actBefore] = await Promise.all([
    cohortCounts(client, scope, window),
    cohortCounts(client, scope, prev),
    activityCounts(client, scope, window),
    activityCounts(client, scope, prev),
  ])
  const cohort = withConversion([
    { key: 'qualified', label: 'Qualified', count: cur.qualified, previous: before.qualified, href: `${links.leads}&priority=high` },
    { key: 'contacted', label: 'Contacted', count: cur.contacted, previous: before.contacted, href: links.chats('contacted') },
    { key: 'replied', label: 'Replies', count: cur.replied, previous: before.replied, href: links.chats('conversation') },
    { key: 'meeting', label: 'Meetings', count: cur.meeting, previous: before.meeting, href: links.chats('meeting') },
    { key: 'proposal', label: 'Proposals', count: cur.proposal, previous: before.proposal, href: links.chats('proposal') },
    { key: 'won', label: 'Won', count: cur.won, previous: before.won, href: `${links.leads}&view=won` },
  ])
  const activity = [
    { key: 'connections', label: 'Connections sent', count: act.connections, previous: actBefore.connections, href: links.activity('CONNECTION_SENT') },
    { key: 'messages', label: 'Messages sent', count: act.messages, previous: actBefore.messages, href: links.activity('DM_SENT') },
    { key: 'replies', label: 'Replies received', count: act.replies, previous: actBefore.replies, href: links.activity('REPLY_RECEIVED') },
    { key: 'meetings', label: 'Meetings booked', count: act.meetings, previous: actBefore.meetings, href: links.activity(MEETING_EVENT) },
    { key: 'proposals', label: 'Proposals prepared', count: act.proposals, previous: actBefore.proposals, href: links.activity('UPWORK_PROPOSAL_PREPARED') },
    { key: 'wins', label: 'Wins', count: act.wins, previous: actBefore.wins, href: links.activity(WIN_EVENT) },
  ].map((s) => ({ ...s, conversionPct: null }))
  return { cohort, activity }
}

// ─── Pipeline report ────────────────────────────────────────────────────────

export const PIPELINE_STAGE_GROUPS: Array<{ key: string; label: string; stages: string[] | null }> = [
  { key: 'qualified', label: 'Qualified', stages: null },
  { key: 'contacted', label: 'Contacted', stages: ['new', 'contacted'] },
  { key: 'conversation', label: 'Conversation', stages: ['replied', 'qualifying', 'interested'] },
  { key: 'meeting', label: 'Meeting', stages: ['meeting'] },
  { key: 'proposal', label: 'Proposal', stages: ['proposal', 'negotiation'] },
  { key: 'won', label: 'Won', stages: ['won'] },
]

/** Conversation stage → pipeline group key (used by /chats?cstage= drill-down). */
export function pipelineGroupForStage(stage: string | null | undefined): string | null {
  if (!stage) return null
  return PIPELINE_STAGE_GROUPS.find((g) => g.stages?.includes(stage))?.key ?? null
}

export interface PipelineRow {
  key: string
  label: string
  count: number | null
  conversionPct: number | null
  /** Average days since the lead was created, from a bounded sample; null when unknown. */
  avgAgeDays: number | null
  /** In this stage with no conversation update for STUCK_DAYS. */
  stuck: number | null
  href: string
}

export const STUCK_DAYS = 14
const AGE_SAMPLE = 1000

/** Pure: average age in days from created_at values. */
export function averageAgeDays(createdAt: string[], now: number): number | null {
  const ages = createdAt.map((c) => Date.parse(c)).filter((t) => !Number.isNaN(t)).map((t) => (now - t) / 86_400_000)
  if (ages.length === 0) return null
  return Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10
}

export async function loadPipelineReport(
  client: DbClient,
  scope: ReportScope,
  links: { qualifiedHref: string; stageHref: (key: string) => string },
  now = Date.now(),
): Promise<PipelineRow[]> {
  const allTime = { start: '1970-01-01T00:00:00.000Z', end: new Date(now + 60_000).toISOString() }
  const stuckBefore = new Date(now - STUCK_DAYS * 86_400_000).toISOString()

  const rows = await Promise.all(
    PIPELINE_STAGE_GROUPS.map(async (g) => {
      if (!g.stages) {
        // Qualified, not yet contacted: open leads at/above the band with no send.
        const count = await leadCount(client, scope, allTime, (q) =>
          q.gte('canonical_score', QUALIFIED_MIN_SCORE).eq('archived', false).in('status', ['new']),
        )
        return { key: g.key, label: g.label, count, avgAgeDays: null, stuck: null, href: links.qualifiedHref }
      }
      const [count, stuck, sample] = await Promise.all([
        stateCount(client, scope, null, (q) => q.in('stage', g.stages!)),
        g.key === 'won'
          ? Promise.resolve(null)
          : stateCount(client, scope, null, (q) => q.in('stage', g.stages!).lt('updated_at', stuckBefore)),
        (async () => {
          if (scope.repIds && scope.repIds.length === 0) return [] as string[]
          const leadIds = await matchingLeadIds(client, scope, null, (q) => q.eq('archived', false))
          if (leadIds === null) return null
          if (leadIds.length === 0) return [] as string[]
          const { data, error } = await client
            .from('conversation_states')
            .select('lead_id')
            .eq('organization_id', scope.orgId)
            .in('stage', g.stages!)
            .in('lead_id', leadIds)
            .limit(AGE_SAMPLE)
          if (error) return null
          const ids = (data ?? []).map((r: { lead_id: string | null }) => r.lead_id).filter((x): x is string => Boolean(x))
          if (ids.length === 0) return []
          const { data: leadRows } = await client
            .from('leads')
            .select('id, created_at')
            .in('id', ids)
          return (leadRows ?? []).map((r: { created_at: string }) => r.created_at)
        })(),
      ])
      return {
        key: g.key,
        label: g.label,
        count,
        avgAgeDays: sample === null ? null : averageAgeDays(sample, now),
        stuck,
        href: links.stageHref(g.key),
      }
    }),
  )
  return withConversion(rows)
}

// ─── Revenue report ─────────────────────────────────────────────────────────

export interface RevenueReport {
  won: number | null
  lost: number | null
  /** won ÷ (won + lost); null when nothing closed. */
  winRatePct: number | null
  previousWon: number | null
  previousLost: number | null
  /** Revenue is not stored per deal — reported as not tracked, never estimated. */
  knownRevenue: null
}

export function winRate(won: number | null, lost: number | null): number | null {
  if (won === null || lost === null || won + lost === 0) return null
  return Math.round((won / (won + lost)) * 100)
}

export async function loadRevenueReport(
  client: DbClient,
  scope: ReportScope,
  window: { start: string; end: string },
): Promise<RevenueReport> {
  const prev = previousWindow(window.start, window.end)
  const closed = (col: 'won_at' | 'lost_at', w: { start: string; end: string }) =>
    stateCount(client, scope, null, (q) => q.gte(col, w.start).lt(col, w.end))
  const [won, lost, previousWon, previousLost] = await Promise.all([
    closed('won_at', window),
    closed('lost_at', window),
    closed('won_at', prev),
    closed('lost_at', prev),
  ])
  return { won, lost, winRatePct: winRate(won, lost), previousWon, previousLost, knownRevenue: null }
}
