import type { DbClient } from '@/lib/db/types'
/**
 * Conversation oversight rows (Phase 8.6 / 8.19).
 *
 * Built from `conversation_states` timestamps — never from message bodies —
 * so a manager list costs two narrow reads regardless of thread length. The
 * canonical thread opens in the conversation workspace (`/chats?lead=[id]`).
 */
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { leadLabel } from '@/lib/operations/labels'
import { MEETING_OR_LATER_STAGES } from '@/lib/sales/stage-vocabulary'
import { ageLabel } from '@/components/operations/ops-primitives'

export type ConversationState = 'waiting_on_rep' | 'waiting_on_prospect' | 'follow_up_due' | 'meeting' | 'closed'

export const CONVERSATION_STATE_LABEL: Record<ConversationState, string> = {
  waiting_on_rep: 'Waiting on rep',
  waiting_on_prospect: 'Waiting on prospect',
  follow_up_due: 'Follow-up due',
  meeting: 'Meeting',
  closed: 'Closed',
}

export const CONVERSATION_VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'waiting_me', label: 'Waiting on rep' },
  { value: 'waiting_them', label: 'Waiting on prospect' },
  { value: 'followups', label: 'Follow-ups' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'closed', label: 'Closed' },
  { value: 'over4h', label: 'Waiting > 4h' },
  { value: 'over12h', label: 'Waiting > 12h' },
] as const

export type ConversationView = (typeof CONVERSATION_VIEWS)[number]['value']

export interface ConversationLeadInput {
  id: string
  contactName: string | null
  company: string | null
  companyKey: string | null
  ownerRepId: string | null
  profileName: string | null
  status: string | null
}

export interface ConversationStateInput {
  stage: string | null
  lastSentAt: string | null
  lastReplyAt: string | null
  nextFollowupAt: string | null
  wonAt: string | null
  lostAt: string | null
}

export interface ConversationRow {
  leadId: string
  person: string
  company: string | null
  companyKey: string | null
  ownerRepId: string | null
  ownerName: string | null
  profileName: string | null
  state: ConversationState
  stageLabel: string | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  waitingOn: 'Rep' | 'Prospect' | null
  /** Hours since the side we are waiting on last moved. null when closed. */
  ageHours: number | null
  /**
   * The scheduled follow-up rendered against the clock, e.g. "Overdue by 2d"
   * or "Due in 3d". null when no follow-up is scheduled. Derived from the same
   * `next_followup_at` the state derivation already reads — not a new source.
   * Optional so existing fixture and fallback rows stay valid.
   */
  followUpLabel?: string | null
  nextAction: string
  href: string
}

const CLOSED_STATUSES = new Set(['won', 'lost', 'dead', 'no'])
const MEETING_STAGES = new Set<string>(MEETING_OR_LATER_STAGES)

function hoursSince(iso: string | null, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 3_600_000))
}

/**
 * Renders a scheduled follow-up against the clock. `next_followup_at` is
 * already fetched and used to derive the conversation state; this only makes
 * the lateness legible instead of dropping it from the projection.
 */
export function followUpWhenLabel(dueIso: string | null, now: number): string | null {
  if (!dueIso) return null
  const due = Date.parse(dueIso)
  if (Number.isNaN(due)) return null
  const diffHours = Math.round((due - now) / 3_600_000)
  if (diffHours <= 0) {
    const over = -diffHours
    if (over < 1) return 'Overdue · due today'
    if (over < 24) return `Overdue by ${over}h`
    return `Overdue by ${Math.floor(over / 24)}d`
  }
  if (diffHours < 1) return 'Due within the hour'
  if (diffHours < 24) return `Due in ${diffHours}h`
  return `Due in ${Math.round(diffHours / 24)}d`
}

/** Pure. Returns null when there is no conversation yet (nothing sent or received). */
export function deriveConversationRow(
  lead: ConversationLeadInput,
  state: ConversationStateInput | null,
  ownerName: string | null,
  now: number,
): ConversationRow | null {
  const lastIn = state?.lastReplyAt ?? null
  const lastOut = state?.lastSentAt ?? null
  if (!lastIn && !lastOut) return null

  const closed =
    CLOSED_STATUSES.has(lead.status ?? '') ||
    state?.stage === 'won' ||
    state?.stage === 'lost' ||
    Boolean(state?.wonAt || state?.lostAt)
  const inboundIsLatest = Boolean(lastIn && (!lastOut || Date.parse(lastIn) > Date.parse(lastOut)))
  const followUpDue = Boolean(
    !inboundIsLatest && state?.nextFollowupAt && Date.parse(state.nextFollowupAt) <= now,
  )

  let conv: ConversationState
  if (closed) conv = 'closed'
  else if (inboundIsLatest) conv = 'waiting_on_rep'
  else if (state?.stage && MEETING_STAGES.has(state.stage)) conv = 'meeting'
  else if (followUpDue) conv = 'follow_up_due'
  else conv = 'waiting_on_prospect'

  const waitingOn = conv === 'closed' ? null : inboundIsLatest ? 'Rep' : 'Prospect'
  const ageHours = conv === 'closed' ? null : hoursSince(inboundIsLatest ? lastIn : lastOut, now)

  const nextAction =
    conv === 'waiting_on_rep'
      ? 'Reply'
      : conv === 'follow_up_due'
        ? 'Send follow-up'
        : conv === 'meeting'
          ? 'Prepare for meeting'
          : conv === 'closed'
            ? 'None'
            : 'Wait for reply'

  return {
    leadId: lead.id,
    person: leadLabel(lead.contactName, null),
    company: lead.company,
    companyKey: lead.companyKey,
    ownerRepId: lead.ownerRepId,
    ownerName,
    profileName: lead.profileName,
    state: conv,
    stageLabel: state?.stage ?? null,
    lastInboundAt: lastIn,
    lastOutboundAt: lastOut,
    waitingOn,
    ageHours,
    followUpLabel: followUpWhenLabel(state?.nextFollowupAt ?? null, now),
    nextAction,
    href: `/chats?lead=${lead.id}`,
  }
}

/**
 * Why this conversation is in the Inbox, in one canonical sentence. Derived
 * only from the waiting state and its age — never from AI reasoning, and never
 * invented when the state is closed.
 */
export function attentionReason(row: Pick<ConversationRow, 'state' | 'ageHours' | 'followUpLabel'>): string {
  const age = ageLabel(row.ageHours)
  switch (row.state) {
    case 'waiting_on_rep':
      return `Client replied ${age} ago. No reply has been sent since.`
    case 'follow_up_due':
      return row.followUpLabel
        ? `${row.followUpLabel}. Last outbound was ${age} ago.`
        : `Follow-up due. Last outbound was ${age} ago.`
    case 'waiting_on_prospect':
      return `Waiting on the client. Last outbound was ${age} ago.`
    case 'meeting':
      return `Meeting scheduled. Last client message was ${age} ago.`
    case 'closed':
      return 'This conversation is closed. No action needed.'
  }
}

/** Compact queue-row form of the same canonical reason. */
export function attentionShort(row: Pick<ConversationRow, 'state' | 'ageHours' | 'followUpLabel'>): string {
  const age = ageLabel(row.ageHours)
  switch (row.state) {
    case 'waiting_on_rep':
      return `Client replied ${age} ago`
    case 'follow_up_due':
      return row.followUpLabel ?? `Follow-up due · ${age}`
    case 'waiting_on_prospect':
      return `Waiting on client · ${age}`
    case 'meeting':
      return `Meeting · ${age}`
    case 'closed':
      return 'Closed'
  }
}

export function filterConversationRows(rows: readonly ConversationRow[], view: string | null): ConversationRow[] {
  switch (view) {
    case 'waiting_me':
      return rows.filter((r) => r.state === 'waiting_on_rep')
    case 'waiting_them':
      return rows.filter((r) => r.state === 'waiting_on_prospect')
    case 'followups':
      return rows.filter((r) => r.state === 'follow_up_due')
    case 'meetings':
      return rows.filter((r) => r.state === 'meeting')
    case 'closed':
      return rows.filter((r) => r.state === 'closed')
    case 'over4h':
      return rows.filter((r) => r.state === 'waiting_on_rep' && (r.ageHours ?? 0) >= 4)
    case 'over12h':
      return rows.filter((r) => r.state === 'waiting_on_rep' && (r.ageHours ?? 0) >= 12)
    default:
      return [...rows]
  }
}

const STATE_ORDER: Record<ConversationState, number> = {
  waiting_on_rep: 0,
  follow_up_due: 1,
  meeting: 2,
  waiting_on_prospect: 3,
  closed: 4,
}

/** Waiting-on-rep first, oldest wait first within a state. */
export function sortConversationRows(rows: ConversationRow[]): ConversationRow[] {
  return rows.sort((a, b) => {
    const s = STATE_ORDER[a.state] - STATE_ORDER[b.state]
    if (s !== 0) return s
    return (b.ageHours ?? -1) - (a.ageHours ?? -1)
  })
}

export function countConversationViews(rows: readonly ConversationRow[]): Record<ConversationView, number> {
  const out = {} as Record<ConversationView, number>
  for (const v of CONVERSATION_VIEWS) out[v.value] = filterConversationRows(rows, v.value).length
  return out
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export interface ConversationQuery {
  orgId: string
  repIds: string[] | null
  companyKey?: string | null
  profileId?: string | null
  limit?: number
}

const LEAD_CAP = 1500

export async function loadConversationRows(
  client: DbClient,
  query: ConversationQuery,
  now = Date.now(),
): Promise<ConversationRow[]> {
  if (query.repIds && query.repIds.length === 0) return []
  let leadsQ = client
    .from('leads')
    .select('id, contact_name, company, company_key, owner_rep_id, revenue_identity_id, status')
    .eq('organization_id', query.orgId)
    .eq('archived', false)
    .eq('is_test', false)
    .order('created_at', { ascending: false })
    .limit(LEAD_CAP)
  if (query.repIds) leadsQ = leadsQ.in('owner_rep_id', query.repIds)
  if (query.companyKey) leadsQ = leadsQ.eq('company_key', query.companyKey)
  if (query.profileId) leadsQ = leadsQ.eq('revenue_identity_id', query.profileId)
  const { data: leadRows, error } = await leadsQ
  if (error) throw error
  const leads = (leadRows ?? []) as Array<{
    id: string
    contact_name: string | null
    company: string | null
    company_key: string | null
    owner_rep_id: string | null
    revenue_identity_id: string | null
    status: string | null
  }>
  if (leads.length === 0) return []

  const identityIds = [...new Set(leads.map((l) => l.revenue_identity_id).filter(Boolean))] as string[]
  const ownerIds = [...new Set(leads.map((l) => l.owner_rep_id).filter(Boolean))] as string[]
  const [states, identities, reps] = await Promise.all([
    chunkedIn<{
      lead_id: string
      stage: string | null
      last_sent_at: string | null
      last_reply_at: string | null
      next_followup_at: string | null
      won_at: string | null
      lost_at: string | null
    }>(leads.map((l) => l.id), (chunk) =>
      client
        .from('conversation_states')
        .select('lead_id, stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at')
        .eq('organization_id', query.orgId)
        .in('lead_id', chunk),
    ),
    chunkedIn<{ id: string; identity_name: string }>(identityIds, (chunk) =>
      client.from('revenue_identities').select('id, identity_name').eq('organization_id', query.orgId).in('id', chunk),
    ).catch(() => []),
    chunkedIn<{ id: string; name: string }>(ownerIds, (chunk) =>
      client.from('reps').select('id, name').eq('organization_id', query.orgId).in('id', chunk),
    ),
  ])
  const stateByLead = new Map(states.map((s) => [s.lead_id, s]))
  const identityName = new Map(identities.map((i) => [i.id, i.identity_name]))
  const repName = new Map(reps.map((r) => [r.id, r.name]))

  const rows: ConversationRow[] = []
  for (const lead of leads) {
    const s = stateByLead.get(lead.id)
    const row = deriveConversationRow(
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
        ? {
            stage: s.stage,
            lastSentAt: s.last_sent_at,
            lastReplyAt: s.last_reply_at,
            nextFollowupAt: s.next_followup_at,
            wonAt: s.won_at,
            lostAt: s.lost_at,
          }
        : null,
      lead.owner_rep_id ? repName.get(lead.owner_rep_id) ?? null : null,
      now,
    )
    if (row) rows.push(row)
  }
  return sortConversationRows(rows).slice(0, Math.min(query.limit ?? 300, 500))
}
