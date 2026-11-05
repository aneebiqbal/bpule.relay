import type { DbClient } from '@/lib/db/types'
/**
 * Conversation queue for the three-pane /chats workspace (Phase 8 / Slice C).
 *
 * Waiting state, age and next action come from `deriveConversationRow` — the
 * same rule Rep 360, Team and Account 360 use (parity). The queue adds only:
 * a 140-char preview of the last message, the client's last intent (from the
 * canonical conversation memory, one JSON path), thread-review and
 * unassigned flags, and a priority band.
 *
 * Egress: leads + conversation_states are scalar columns; message previews
 * are read only for the visible page of rows. With `lead_message_previews`
 * (20261101151000) Postgres returns one 160-char preview per lead; until that
 * view is applied the fallback reads full bodies and truncates on the server.
 * The thread itself loads only when a conversation is opened.
 */
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { leadBelongsToWorkspace } from '@/lib/workspace/active-identity'
import { deriveConversationRow, type ConversationRow } from '@/lib/operations/conversations'
import { sourceBucket, type OpsSource } from '@/lib/operations/filters'
import { pipelineGroupForStage } from '@/lib/operations/reports'

export const CHAT_VIEWS = [
  { value: 'waiting_me', label: 'Needs reply', managerOnly: false },
  { value: 'waiting_them', label: 'Waiting', managerOnly: false },
  { value: 'followups', label: 'Follow-ups', managerOnly: false },
  { value: 'meeting_requests', label: 'Meeting requests', managerOnly: false },
  { value: 'proposal_requests', label: 'Proposal requests', managerOnly: false },
  { value: 'closed', label: 'Closed', managerOnly: false },
  { value: 'over4h', label: 'Waiting >4h', managerOnly: true },
  { value: 'over12h', label: 'Waiting >12h', managerOnly: true },
  { value: 'unassigned', label: 'Unassigned', managerOnly: true },
  { value: 'review', label: 'Thread review', managerOnly: true },
] as const

export type ChatView = (typeof CHAT_VIEWS)[number]['value'] | 'all'

export type ChatPriority = 'critical' | 'high' | 'normal' | 'low'

export interface ChatRow extends ConversationRow {
  title: string | null
  source: OpsSource
  profileId: string | null
  /** Client's last analysed intent (canonical conversation memory). */
  clientIntent: string | null
  preview: string | null
  previewFrom: 'client' | 'me' | null
  /** Latest message's sender identity was not verified against the lead. */
  needsReview: boolean
  unassigned: boolean
  priority: ChatPriority
}

const PROPOSAL_INTENTS = new Set(['pricing'])

/** Pure: priority band. Waiting on the rep ages fastest; closed is low. */
export function chatPriority(row: Pick<ConversationRow, 'state' | 'ageHours'>, clientIntent: string | null): ChatPriority {
  if (row.state === 'closed') return 'low'
  if (row.state === 'waiting_on_rep') {
    if ((row.ageHours ?? 0) >= 12) return 'critical'
    if ((row.ageHours ?? 0) >= 4 || clientIntent === 'meeting_request' || PROPOSAL_INTENTS.has(clientIntent ?? '')) return 'high'
    return 'normal'
  }
  if (row.state === 'follow_up_due') return 'normal'
  return 'low'
}

/** Pure: does a row belong to a queue view? */
export function chatViewMatches(row: ChatRow, view: ChatView): boolean {
  switch (view) {
    case 'waiting_me':
      return row.state === 'waiting_on_rep'
    case 'waiting_them':
      return row.state === 'waiting_on_prospect' || row.state === 'meeting'
    case 'followups':
      return row.state === 'follow_up_due'
    case 'meeting_requests':
      return row.state !== 'closed' && row.clientIntent === 'meeting_request'
    case 'proposal_requests':
      return row.state !== 'closed' && PROPOSAL_INTENTS.has(row.clientIntent ?? '')
    case 'closed':
      return row.state === 'closed'
    case 'over4h':
      return row.state === 'waiting_on_rep' && (row.ageHours ?? 0) >= 4
    case 'over12h':
      return row.state === 'waiting_on_rep' && (row.ageHours ?? 0) >= 12
    case 'unassigned':
      return row.state !== 'closed' && row.unassigned
    case 'review':
      return row.needsReview
    default:
      return row.state !== 'closed'
  }
}

export function countChatViews(rows: readonly ChatRow[], includeManager: boolean): Record<string, number> {
  const out: Record<string, number> = { all: rows.filter((r) => chatViewMatches(r, 'all')).length }
  for (const v of CHAT_VIEWS) {
    if (v.managerOnly && !includeManager) continue
    out[v.value] = rows.filter((r) => chatViewMatches(r, v.value)).length
  }
  return out
}

const PRIORITY_RANK: Record<ChatPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 }

/** Highest priority first, then oldest wait. */
export function sortChatRows(rows: ChatRow[]): ChatRow[] {
  return rows.sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (p !== 0) return p
    return (b.ageHours ?? -1) - (a.ageHours ?? -1)
  })
}

export function truncatePreview(text: string | null | undefined, max = 140): string | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Legacy/aliases that must keep resolving after the nav cleanup. The canonical
 * values above never change; these only map old links onto them.
 */
const CHAT_VIEW_ALIASES: Record<string, string> = {
  'needs-reply': 'waiting_me',
  meeting: 'meeting_requests',
  proposal: 'proposal_requests',
  'thread-review': 'review',
}

export function parseChatView(raw: string | null | undefined, includeManager: boolean): ChatView {
  const normalized = raw ? (CHAT_VIEW_ALIASES[raw] ?? raw) : null
  const found = CHAT_VIEWS.find((v) => v.value === normalized)
  if (!found) return 'all'
  if (found.managerOnly && !includeManager) return 'all'
  return found.value
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export interface ChatQueueQuery {
  orgId: string
  /** null = organization. */
  repIds: string[] | null
  /** Rep scope only: the active sending workspace (profile scoping, BUG-30). */
  workspace?: { id: string; profileId?: string | null } | null
  profileId?: string | null
  source?: OpsSource | null
  q?: string | null
  view: ChatView
  /** Manager/Admin oversight views (>4h, >12h, unassigned, review). */
  managerViews: boolean
  /** Hide rows younger than this (hours waiting). */
  minAgeHours?: number | null
  /** Pipeline stage group (Reports drill-down): contacted | conversation | meeting | proposal | won. */
  stageGroup?: string | null
  limit?: number
  /** `messagePreviews` capability: read the bounded DB-side preview view. */
  previewView?: boolean
}

export interface ChatQueue {
  rows: ChatRow[]
  counts: Record<string, number>
  total: number
  truncated: boolean
}

const LEAD_CAP = 1500

interface LeadRowRaw {
  id: string
  contact_name: string | null
  contact_title: string | null
  company: string | null
  company_key: string | null
  owner_rep_id: string | null
  revenue_identity_id: string | null
  sender_profile_id: string | null
  status: string | null
  source: string | null
}

interface StateRowRaw {
  lead_id: string
  stage: string | null
  last_sent_at: string | null
  last_reply_at: string | null
  next_followup_at: string | null
  won_at: string | null
  lost_at: string | null
  intent?: string | null
}

async function loadStates(client: DbClient, orgId: string, leadIds: string[]): Promise<StateRowRaw[]> {
  const base = 'lead_id, stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at'
  try {
    return await chunkedIn<StateRowRaw>(leadIds, (chunk) =>
      client
        .from('conversation_states')
        .select(`${base}, intent:memory->lastClientAnalysis->>intent`)
        .eq('organization_id', orgId)
        .in('lead_id', chunk),
    )
  } catch {
    // Databases without the memory column: the queue still works, intents are unknown.
    return chunkedIn<StateRowRaw>(leadIds, (chunk) =>
      client.from('conversation_states').select(base).eq('organization_id', orgId).in('lead_id', chunk),
    )
  }
}

interface LatestPreview {
  lead_id: string
  direction: string | null
  thread_status: string | null
  preview: string | null
}

/**
 * Latest sent message per lead, as a short preview. Exported for tests.
 * View path: one row per lead, text cut in SQL. Fallback: up to 4 rows per
 * lead with full bodies (pre-activation behaviour), truncated here.
 */
export async function loadLatestPreviews(
  client: DbClient,
  leadIds: string[],
  useView: boolean,
): Promise<Map<string, LatestPreview>> {
  const latestBy = new Map<string, LatestPreview>()
  if (leadIds.length === 0) return latestBy
  if (useView) {
    const rows = await chunkedIn<LatestPreview>(leadIds, (chunk) =>
      client.from('lead_message_previews').select('lead_id, direction, thread_status, preview').in('lead_id', chunk),
    ).catch(() => [])
    for (const r of rows) latestBy.set(r.lead_id, r)
    return latestBy
  }
  const rows = await chunkedIn<{ lead_id: string; direction: string | null; sent_text: string | null; thread_status: string | null }>(
    leadIds,
    (chunk) =>
      client
        .from('messages')
        .select('lead_id, direction, sent_text, sent_at, thread_status')
        .in('lead_id', chunk)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(chunk.length * 4),
  ).catch(() => [])
  for (const m of rows) {
    if (latestBy.has(m.lead_id)) continue
    latestBy.set(m.lead_id, { lead_id: m.lead_id, direction: m.direction, thread_status: m.thread_status, preview: truncatePreview(m.sent_text) })
  }
  return latestBy
}

export async function loadChatQueue(
  client: DbClient,
  query: ChatQueueQuery,
  now = Date.now(),
): Promise<ChatQueue> {
  const includeManager = query.managerViews
  if (query.repIds && query.repIds.length === 0) return { rows: [], counts: countChatViews([], includeManager), total: 0, truncated: false }

  let leadsQ = client
    .from('leads')
    .select('id, contact_name, contact_title, company, company_key, owner_rep_id, revenue_identity_id, sender_profile_id, status, source')
    .eq('organization_id', query.orgId)
    .eq('archived', false)
    .eq('is_test', false)
    .order('created_at', { ascending: false })
    .limit(LEAD_CAP)
  if (query.repIds) leadsQ = leadsQ.in('owner_rep_id', query.repIds)
  if (query.profileId) leadsQ = leadsQ.eq('revenue_identity_id', query.profileId)
  if (query.q) {
    const term = query.q.replace(/[%,()\\*:]/g, ' ').trim().slice(0, 60)
    if (term) leadsQ = leadsQ.or(`contact_name.ilike.%${term}%,company.ilike.%${term}%`)
  }
  const { data, error } = await leadsQ
  if (error) throw error
  let leads = (data ?? []) as LeadRowRaw[]
  if (query.workspace) {
    leads = leads.filter((l) =>
      leadBelongsToWorkspace({ revenueIdentityId: l.revenue_identity_id, senderProfileId: l.sender_profile_id }, query.workspace!),
    )
  }
  if (query.source) leads = leads.filter((l) => sourceBucket(l.source) === query.source)
  if (leads.length === 0) return { rows: [], counts: countChatViews([], includeManager), total: 0, truncated: false }

  const identityIds = [...new Set(leads.map((l) => l.revenue_identity_id).filter(Boolean))] as string[]
  const ownerIds = [...new Set(leads.map((l) => l.owner_rep_id).filter(Boolean))] as string[]
  const [states, identities, reps] = await Promise.all([
    loadStates(client, query.orgId, leads.map((l) => l.id)),
    chunkedIn<{ id: string; identity_name: string }>(identityIds, (chunk) =>
      client.from('revenue_identities').select('id, identity_name').eq('organization_id', query.orgId).in('id', chunk),
    ).catch(() => []),
    chunkedIn<{ id: string; name: string }>(ownerIds, (chunk) =>
      client.from('reps').select('id, name').eq('organization_id', query.orgId).in('id', chunk),
    ),
  ])
  const stateBy = new Map(states.map((s) => [s.lead_id, s]))
  const identityName = new Map(identities.map((i) => [i.id, i.identity_name]))
  const repName = new Map(reps.map((r) => [r.id, r.name]))

  const all: ChatRow[] = []
  for (const lead of leads) {
    const s = stateBy.get(lead.id)
    const base = deriveConversationRow(
      {
        id: lead.id,
        contactName: lead.contact_name,
        company: lead.company,
        companyKey: lead.company_key,
        ownerRepId: lead.owner_rep_id,
        profileName: lead.revenue_identity_id ? identityName.get(lead.revenue_identity_id) ?? null : null,
        status: lead.status,
      },
      s
        ? { stage: s.stage, lastSentAt: s.last_sent_at, lastReplyAt: s.last_reply_at, nextFollowupAt: s.next_followup_at, wonAt: s.won_at, lostAt: s.lost_at }
        : null,
      lead.owner_rep_id ? repName.get(lead.owner_rep_id) ?? null : null,
      now,
    )
    if (!base) continue
    const clientIntent = s?.intent ?? null
    all.push({
      ...base,
      href: `/chats?lead=${lead.id}`,
      title: lead.contact_title,
      source: sourceBucket(lead.source),
      profileId: lead.revenue_identity_id,
      clientIntent,
      preview: null,
      previewFrom: null,
      needsReview: false,
      unassigned: !lead.owner_rep_id || !lead.revenue_identity_id,
      priority: chatPriority(base, clientIntent),
    })
  }

  // Thread review needs the latest message's verification flag; read it with
  // the previews for the visible page only (below). For counts, review is
  // computed on that page — documented in the UI as "on this page".
  const counts = countChatViews(all, includeManager)
  let filtered = all.filter((r) => chatViewMatches(r, query.view === 'review' ? 'all' : query.view))
  if (query.minAgeHours) filtered = filtered.filter((r) => (r.ageHours ?? 0) >= query.minAgeHours!)
  if (query.stageGroup) {
    filtered = all.filter((r) => pipelineGroupForStage(r.stageLabel) === query.stageGroup)
  }
  sortChatRows(filtered)
  const limit = Math.min(Math.max(query.limit ?? 60, 1), 200)
  const page = filtered.slice(0, query.view === 'review' ? 200 : limit)

  const latestBy = await loadLatestPreviews(client, page.map((r) => r.leadId), Boolean(query.previewView))
  for (const row of page) {
    const m = latestBy.get(row.leadId)
    if (!m) continue
    row.preview = truncatePreview(m.preview)
    row.previewFrom = m.direction === 'inbound' ? 'client' : 'me'
    row.needsReview = m.thread_status === 'UNVERIFIED' && m.direction === 'inbound'
  }

  const rows = query.view === 'review' ? page.filter((r) => r.needsReview).slice(0, limit) : page
  if (query.view === 'review' || includeManager) counts.review = page.filter((r) => r.needsReview).length

  return { rows, counts, total: filtered.length, truncated: leads.length >= LEAD_CAP }
}
