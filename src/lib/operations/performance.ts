import type { DbClient } from '@/lib/db/types'
/**
 * Team performance (Phase 8.21–8.25).
 *
 * Counts are executed work only: *_SENT / APPLIED / RECEIVED events whose
 * execution_status is not 'failed'. Drafts (*_PREPARED for connections and
 * DMs) are never counted as sends. Nothing here is an opaque score — every
 * number is a count or a ratio of two counts shown next to each other.
 *
 * The personal /performance heatmap (activity-model.ts) applies the same
 * rule via canonicalActionFor — DRAFT_NOT_SENT is a shared contract.
 */
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { qualifyCanonicalScore } from '@/lib/scoring/qualification'
import { sourceBucket, type OpsSource } from '@/lib/operations/filters'
import { stageRatioPct } from '@/lib/operations/reports'
import { MEETING_EVENT } from '@/lib/sales/meetings'
import { readAllPages } from '@/lib/operations/paged-read'

export interface ExecutionMetrics {
  connections: number
  messages: number
  /** Replies sent by the rep (subset of messages). */
  repliesSent: number
  replies: number
  meetings: number
  proposals: number
  wins: number
  applications: number
  tasksCompleted: number
  leadsWorked: number
  leadsContacted: number
  leadsReplied: number
}

export const METRIC_LABELS: Array<{ key: keyof ExecutionMetrics; label: string; hint: string }> = [
  { key: 'connections', label: 'Connections', hint: 'Connection requests sent.' },
  { key: 'messages', label: 'Messages', hint: 'First messages, follow-ups and replies sent.' },
  { key: 'replies', label: 'Replies', hint: 'Inbound replies received from prospects.' },
  { key: 'meetings', label: 'Meetings', hint: 'Meetings booked (MEETING_BOOKED events).' },
  { key: 'proposals', label: 'Proposals', hint: 'Proposals prepared.' },
  { key: 'wins', label: 'Wins', hint: 'Deals closed as won.' },
  { key: 'applications', label: 'Applications', hint: 'Upwork applications submitted.' },
  { key: 'tasksCompleted', label: 'Tasks completed', hint: 'Assigned tasks marked done.' },
]

export interface PerfEvent {
  actor_id: string | null
  action_type: string
  execution_status: string | null
  lead_id: string | null
  /** The sending LinkedIn profile (profiles.id) — not a revenue identity; see identityResolver. */
  sender_profile_id?: string | null
}

/**
 * Profile performance is reported per revenue identity, but events carry the
 * sending profile. The identity built on that profile owns the event; when no
 * identity (or more than one) uses it, the event's lead's identity does.
 */
export function identityResolver(
  identities: ReadonlyArray<{ id: string; profile_id: string | null }>,
  leadIdentity: (leadId: string) => string | null | undefined,
): (e: PerfEvent) => string | null {
  const byProfile = new Map<string, string | null>()
  for (const i of identities) {
    if (!i.profile_id) continue
    byProfile.set(i.profile_id, byProfile.has(i.profile_id) ? null : i.id)
  }
  return (e) =>
    (e.sender_profile_id ? byProfile.get(e.sender_profile_id) : null) ?? (e.lead_id ? leadIdentity(e.lead_id) ?? null : null)
}

const OUTREACH_TYPES = new Set(['CONNECTION_SENT', 'DM_SENT', 'FOLLOWUP_SENT'])
const WORKED_TYPES = new Set([
  'CONNECTION_SENT',
  'DM_SENT',
  'FOLLOWUP_SENT',
  'REPLY_SENT',
  'REPLY_RECEIVED',
  'MEETING_BOOKED',
  'UPWORK_PROPOSAL_PREPARED',
  'UPWORK_APPLIED',
  'CLIENT_WON',
])

export const PERFORMANCE_ACTION_TYPES = [...WORKED_TYPES]

export function emptyMetrics(): ExecutionMetrics {
  return {
    connections: 0,
    messages: 0,
    repliesSent: 0,
    replies: 0,
    meetings: 0,
    proposals: 0,
    wins: 0,
    applications: 0,
    tasksCompleted: 0,
    leadsWorked: 0,
    leadsContacted: 0,
    leadsReplied: 0,
  }
}

/** Aggregate events into metrics. Distinct-lead counters are computed per group. */
export function aggregateMetrics(events: readonly PerfEvent[], tasksCompleted = 0): ExecutionMetrics {
  const m = emptyMetrics()
  const worked = new Set<string>()
  const contacted = new Set<string>()
  const replied = new Set<string>()
  for (const e of events) {
    if (e.execution_status === 'failed') continue
    switch (e.action_type) {
      case 'CONNECTION_SENT':
        m.connections += 1
        break
      case 'DM_SENT':
      case 'FOLLOWUP_SENT':
        m.messages += 1
        break
      case 'REPLY_SENT':
        m.messages += 1
        m.repliesSent += 1
        break
      case 'REPLY_RECEIVED':
        m.replies += 1
        break
      case MEETING_EVENT:
        m.meetings += 1
        break
      case 'UPWORK_PROPOSAL_PREPARED':
        m.proposals += 1
        break
      case 'CLIENT_WON':
        m.wins += 1
        break
      case 'UPWORK_APPLIED':
        m.applications += 1
        break
      default:
        continue
    }
    if (e.lead_id) {
      if (WORKED_TYPES.has(e.action_type)) worked.add(e.lead_id)
      if (OUTREACH_TYPES.has(e.action_type)) contacted.add(e.lead_id)
      if (e.action_type === 'REPLY_RECEIVED') replied.add(e.lead_id)
    }
  }
  m.tasksCompleted = tasksCompleted
  m.leadsWorked = worked.size
  m.leadsContacted = contacted.size
  m.leadsReplied = replied.size
  return m
}

/** Replied leads / contacted leads. null when nothing was contacted — never 0%. */
export function replyRate(m: Pick<ExecutionMetrics, 'leadsContacted' | 'leadsReplied'>): number | null {
  if (m.leadsContacted === 0) return null
  return Math.round((Math.min(m.leadsReplied, m.leadsContacted) / m.leadsContacted) * 100)
}

export function groupMetrics<K extends string>(
  events: readonly PerfEvent[],
  keyOf: (e: PerfEvent) => K | null,
  tasksByKey?: ReadonlyMap<K, number>,
): Map<K, ExecutionMetrics> {
  const buckets = new Map<K, PerfEvent[]>()
  for (const e of events) {
    const key = keyOf(e)
    if (key === null) continue
    const list = buckets.get(key) ?? []
    list.push(e)
    buckets.set(key, list)
  }
  const out = new Map<K, ExecutionMetrics>()
  for (const [key, list] of buckets) out.set(key, aggregateMetrics(list, tasksByKey?.get(key) ?? 0))
  if (tasksByKey) {
    for (const [key, n] of tasksByKey) if (!out.has(key)) out.set(key, aggregateMetrics([], n))
  }
  return out
}

// ─── Conversion funnel ──────────────────────────────────────────────────────

export interface FunnelLead {
  id: string
  status: string | null
  stage: string | null
  lastSentAt: string | null
  lastReplyAt: string | null
  wonAt: string | null
}

export interface FunnelStep {
  key: 'lead' | 'contact' | 'reply' | 'meeting' | 'proposal' | 'won'
  label: string
  /** Transition label, e.g. "Lead → Contact". */
  transition: string | null
  count: number
  /** Percent of the previous step. null for the first step or an empty previous step. */
  conversionPct: number | null
}

const MEETING_STAGES = new Set(['meeting', 'proposal', 'negotiation', 'won'])
const PROPOSAL_STAGES = new Set(['proposal', 'negotiation', 'won'])
const REPLY_STATUSES = new Set(['replied', 'won'])
const CONTACT_STATUSES = new Set(['contacted', 'followed_up', 'replied', 'won', 'lost'])

/**
 * Furthest known stage per lead, from canonical columns only. A lost lead
 * counts as contacted only if something was sent; nothing is inferred past
 * the evidence.
 */
export function furthestStage(lead: FunnelLead): FunnelStep['key'] {
  const won = lead.status === 'won' || lead.stage === 'won' || Boolean(lead.wonAt)
  if (won) return 'won'
  if (lead.stage && PROPOSAL_STAGES.has(lead.stage)) return 'proposal'
  if (lead.stage && MEETING_STAGES.has(lead.stage)) return 'meeting'
  const replied =
    Boolean(lead.lastReplyAt) ||
    REPLY_STATUSES.has(lead.status ?? '') ||
    ['replied', 'qualifying', 'interested'].includes(lead.stage ?? '')
  if (replied) return 'reply'
  const contacted =
    Boolean(lead.lastSentAt) ||
    (lead.status !== 'lost' && CONTACT_STATUSES.has(lead.status ?? '')) ||
    lead.stage === 'contacted'
  if (contacted) return 'contact'
  return 'lead'
}

const FUNNEL_ORDER: Array<{ key: FunnelStep['key']; label: string }> = [
  { key: 'lead', label: 'Leads' },
  { key: 'contact', label: 'Contacted' },
  { key: 'reply', label: 'Replied' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
]

const SHORT: Record<FunnelStep['key'], string> = {
  lead: 'Lead',
  contact: 'Contact',
  reply: 'Reply',
  meeting: 'Meeting',
  proposal: 'Proposal',
  won: 'Won',
}

export function buildFunnel(leads: readonly FunnelLead[]): FunnelStep[] {
  const rank = new Map(FUNNEL_ORDER.map((s, i) => [s.key, i]))
  const reached = FUNNEL_ORDER.map(() => 0)
  for (const lead of leads) {
    const r = rank.get(furthestStage(lead)) ?? 0
    for (let i = 0; i <= r; i += 1) reached[i] += 1
  }
  return FUNNEL_ORDER.map((step, i) => {
    const prev = i > 0 ? reached[i - 1] : null
    return {
      key: step.key,
      label: step.label,
      transition: i > 0 ? `${SHORT[FUNNEL_ORDER[i - 1].key]} → ${SHORT[step.key]}` : null,
      count: reached[i],
      conversionPct: stageRatioPct(reached[i], prev),
    }
  })
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export interface CohortLead extends FunnelLead {
  ownerRepId: string | null
  source: OpsSource
  profileId: string | null
  qualified: boolean
}

export interface PerformanceData {
  totals: ExecutionMetrics
  funnel: FunnelStep[]
  byRep: Array<{ repId: string; repName: string; metrics: ExecutionMetrics; replyRate: number | null }>
  byProfile: Array<{
    profileId: string | null
    profileName: string
    opportunities: number
    metrics: ExecutionMetrics
    replyRate: number | null
  }>
  bySource: Array<{
    source: OpsSource
    label: string
    qualified: number
    contacted: number
    replies: number
    meetings: number
    wins: number
  }>
  /** True when an event read hit its cap; the UI says so instead of implying totals are complete. */
  truncated: boolean
}

export interface PerformanceQuery {
  orgId: string
  repIds: string[] | null
  start: string
  end: string
  profileId?: string | null
  source?: OpsSource | null
}

const EVENT_CAP = 5000
/**
 * Execution events are read in pages up to this ceiling (was a single 5,000
 * read that silently undercounted busy windows). Production holds ~5,200
 * action_events in total (2026-11-01). Past the ceiling `truncated` is set
 * and the UI says so; a GROUP BY RPC is the follow-up if windows get there.
 */
export const PERFORMANCE_EVENT_CEILING = 50_000
const COHORT_CAP = 3000

export async function loadPerformance(client: DbClient, query: PerformanceQuery): Promise<PerformanceData> {
  if (query.repIds && query.repIds.length === 0) {
    return emptyPerformance()
  }

  const eventsRead = readAllPages<PerfEvent>(
    (from, to) => {
      let q = client
        .from('action_events')
        .select('actor_id, action_type, execution_status, lead_id, sender_profile_id')
        .eq('organization_id', query.orgId)
        .in('action_type', PERFORMANCE_ACTION_TYPES)
        .gte('occurred_at', query.start)
        .lt('occurred_at', query.end)
        .order('occurred_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      if (query.repIds) q = q.in('actor_id', query.repIds)
      return q as unknown as PromiseLike<{ data: PerfEvent[] | null; error: unknown }>
    },
    { ceiling: PERFORMANCE_EVENT_CEILING },
  ).catch((error: unknown) => {
    if (isMissingRelation(error)) return { rows: [] as PerfEvent[], truncated: false, pages: 0 }
    throw error
  })

  let cohortQ = client
    .from('leads')
    .select('id, owner_rep_id, status, source, revenue_identity_id, canonical_score, created_at')
    .eq('organization_id', query.orgId)
    .eq('is_test', false)
    .gte('created_at', query.start)
    .lt('created_at', query.end)
    .limit(COHORT_CAP)
  if (query.repIds) cohortQ = cohortQ.in('owner_rep_id', query.repIds)
  if (query.profileId) cohortQ = cohortQ.eq('revenue_identity_id', query.profileId)

  let tasksQ = client
    .from('task_events')
    .select('actor_rep_id')
    .eq('organization_id', query.orgId)
    .eq('event_type', 'TASK_COMPLETED')
    .gte('created_at', query.start)
    .lt('created_at', query.end)
    .limit(EVENT_CAP)
  if (query.repIds) tasksQ = tasksQ.in('actor_rep_id', query.repIds)

  const identityProfilesQ = client.from('revenue_identities').select('id, profile_id').eq('organization_id', query.orgId)

  const [eventsRes, cohortRes, tasksRes, identityProfilesRes] = await Promise.all([eventsRead, cohortQ, tasksQ, identityProfilesQ])
  if (cohortRes.error) throw cohortRes.error
  const events = eventsRes.rows
  const cohortRows = (cohortRes.data ?? []) as Array<{
    id: string
    owner_rep_id: string | null
    status: string | null
    source: string | null
    revenue_identity_id: string | null
    canonical_score: number | null
  }>
  const taskRows = tasksRes.error ? [] : ((tasksRes.data ?? []) as Array<{ actor_rep_id: string | null }>)

  // Lead attributes for events (profile + source) — events may reference
  // leads created before the window, so read those separately (narrow).
  const eventLeadIds = [...new Set(events.map((e) => e.lead_id).filter(Boolean))] as string[]
  const cohortById = new Map(cohortRows.map((l) => [l.id, l]))
  const missing = eventLeadIds.filter((id) => !cohortById.has(id))
  const [extraLeads, states] = await Promise.all([
    chunkedIn<{ id: string; source: string | null; revenue_identity_id: string | null }>(missing, (chunk) =>
      client.from('leads').select('id, source, revenue_identity_id').eq('organization_id', query.orgId).in('id', chunk),
    ),
    chunkedIn<{ lead_id: string; stage: string | null; last_sent_at: string | null; last_reply_at: string | null; won_at: string | null }>(
      cohortRows.map((l) => l.id),
      (chunk) =>
        client
          .from('conversation_states')
          .select('lead_id, stage, last_sent_at, last_reply_at, won_at')
          .eq('organization_id', query.orgId)
          .in('lead_id', chunk),
    ).catch(() => []),
  ])
  const leadAttr = new Map<string, { source: OpsSource; profileId: string | null }>()
  for (const l of cohortRows) leadAttr.set(l.id, { source: sourceBucket(l.source), profileId: l.revenue_identity_id })
  for (const l of extraLeads) leadAttr.set(l.id, { source: sourceBucket(l.source), profileId: l.revenue_identity_id })

  // Admin Home profile rows use the same attribution.
  const profileOf = identityResolver(
    (identityProfilesRes.data ?? []) as Array<{ id: string; profile_id: string | null }>,
    (leadId) => leadAttr.get(leadId)?.profileId,
  )

  // Profile / source filters apply to events through their lead.
  const scopedEvents = events.filter((e) => {
    if (!query.profileId && !query.source) return true
    const attr = e.lead_id ? leadAttr.get(e.lead_id) : undefined
    if (query.profileId && profileOf(e) !== query.profileId) return false
    if (query.source) {
      const src = attr?.source ?? (e.action_type.startsWith('UPWORK_') ? 'upwork' : 'other')
      if (src !== query.source) return false
    }
    return true
  })

  const stateByLead = new Map(states.map((s) => [s.lead_id, s]))
  const cohort: CohortLead[] = cohortRows
    .filter((l) => !query.source || sourceBucket(l.source) === query.source)
    .map((l) => {
      const s = stateByLead.get(l.id)
      return {
        id: l.id,
        ownerRepId: l.owner_rep_id,
        status: l.status,
        stage: s?.stage ?? null,
        lastSentAt: s?.last_sent_at ?? null,
        lastReplyAt: s?.last_reply_at ?? null,
        wonAt: s?.won_at ?? null,
        source: sourceBucket(l.source),
        profileId: l.revenue_identity_id,
        qualified: l.canonical_score != null && ['STRONG', 'WORTH_PURSUING'].includes(qualifyCanonicalScore(l.canonical_score).qualification),
      }
    })

  const tasksByRep = new Map<string, number>()
  for (const t of taskRows) if (t.actor_rep_id) tasksByRep.set(t.actor_rep_id, (tasksByRep.get(t.actor_rep_id) ?? 0) + 1)
  const totalTasks = query.profileId || query.source ? 0 : taskRows.length

  const repGroups = groupMetrics(scopedEvents, (e) => e.actor_id, query.profileId || query.source ? undefined : tasksByRep)
  // Meetings are MEETING_BOOKED events like every other surface
  // (src/lib/sales/meetings.ts); aggregateMetrics counts them.
  const profileGroups = groupMetrics(scopedEvents, (e) => profileOf(e) ?? 'none')
  const sourceGroups = groupMetrics(scopedEvents, (e) => {
    const attr = e.lead_id ? leadAttr.get(e.lead_id) : undefined
    return attr?.source ?? (e.action_type.startsWith('UPWORK_') ? 'upwork' : 'other')
  })

  const repIds = [...repGroups.keys()]
  const profileIds = [...profileGroups.keys(), ...cohort.map((c) => c.profileId ?? 'none')].filter((id) => id !== 'none')
  const [repRows, identityRows] = await Promise.all([
    chunkedIn<{ id: string; name: string }>(repIds, (chunk) =>
      client.from('reps').select('id, name').eq('organization_id', query.orgId).in('id', chunk),
    ),
    chunkedIn<{ id: string; identity_name: string }>([...new Set(profileIds)], (chunk) =>
      client.from('revenue_identities').select('id, identity_name').eq('organization_id', query.orgId).in('id', chunk),
    ).catch(() => []),
  ])
  const repName = new Map(repRows.map((r) => [r.id, r.name]))
  const identityName = new Map(identityRows.map((r) => [r.id, r.identity_name]))

  const opportunitiesByProfile = new Map<string, number>()
  for (const c of cohort) {
    const key = c.profileId ?? 'none'
    opportunitiesByProfile.set(key, (opportunitiesByProfile.get(key) ?? 0) + 1)
  }
  const allProfileKeys = new Set([...profileGroups.keys(), ...opportunitiesByProfile.keys()])

  const SOURCE_LABEL: Record<OpsSource, string> = { linkedin: 'LinkedIn', upwork: 'Upwork', other: 'Other sources' }

  const totals = aggregateMetrics(scopedEvents, totalTasks)

  return {
    totals,
    funnel: buildFunnel(cohort),
    byRep: repIds
      .map((id) => {
        const metrics = repGroups.get(id)!
        return { repId: id, repName: repName.get(id) ?? 'Unknown', metrics, replyRate: replyRate(metrics) }
      })
      .sort((a, b) => a.repName.localeCompare(b.repName)),
    byProfile: [...allProfileKeys]
      .map((key) => {
        const metrics = profileGroups.get(key) ?? emptyMetrics()
        return {
          profileId: key === 'none' ? null : key,
          profileName: key === 'none' ? 'No profile' : identityName.get(key) ?? 'Unknown profile',
          opportunities: opportunitiesByProfile.get(key) ?? 0,
          metrics,
          replyRate: replyRate(metrics),
        }
      })
      .sort((a, b) => (a.profileId === null ? 1 : b.profileId === null ? -1 : a.profileName.localeCompare(b.profileName))),
    bySource: (['linkedin', 'upwork', 'other'] as OpsSource[]).map((source) => {
      const metrics = sourceGroups.get(source) ?? emptyMetrics()
      return {
        source,
        label: SOURCE_LABEL[source],
        qualified: cohort.filter((c) => c.source === source && c.qualified).length,
        contacted: metrics.leadsContacted,
        replies: metrics.replies,
        meetings: metrics.meetings,
        wins: metrics.wins,
      }
    }),
    truncated: eventsRes.truncated || cohortRows.length >= COHORT_CAP,
  }
}

function emptyPerformance(): PerformanceData {
  return {
    totals: emptyMetrics(),
    funnel: buildFunnel([]),
    byRep: [],
    byProfile: [],
    bySource: (['linkedin', 'upwork', 'other'] as OpsSource[]).map((source) => ({
      source,
      label: source === 'linkedin' ? 'LinkedIn' : source === 'upwork' ? 'Upwork' : 'Other sources',
      qualified: 0,
      contacted: 0,
      replies: 0,
      meetings: 0,
      wins: 0,
    })),
    truncated: false,
  }
}
