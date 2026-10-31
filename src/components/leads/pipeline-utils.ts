import type { Lead } from '@/lib/domain/types'
import type { LeadsPageInput } from '@/lib/store/types'
import { getComparableLeadScore } from '@/lib/score/rubric'
import { isLeadLocked } from '@/lib/leads/lock'
import { computeLifecycleState, type LifecycleState, type LifecycleResult } from '@/lib/leads/lifecycle-policy'
import { evaluateFollowUpPolicy } from '@/lib/conversation/follow-up-policy'
import { relationshipHasStarted } from '@/lib/relay/lead-state-machine'
import { formatRelativeTime } from '@/lib/ui/time'
export { formatRelativeTime }

export type LeadRow = Lead & {
  ownerName?: string
  lastActivityAt?: string | null
  senderProfileName?: string | null
  lastOutboundText?: string | null
  lastOutboundAt?: string | null
  lastInboundText?: string | null
  lastInboundAt?: string | null
  followupCount?: number
  /** Open assigned tasks for this lead (Phase 6) — never invents derived work. */
  openAssignedTaskCount?: number
  lifecycle?: LifecycleResult
  hasDmSent?: boolean
}

export type PipelineStage =
  | 'to_contact'
  | 'waiting'
  | 'follow_up_due'
  | 'needs_reply'
  | 'observe'
  | 'done'
  | 'cold'

export interface PipelineColumnDef {
  id: PipelineStage
  label: string
  description: string
  dotColor: string
  iconColor: string
  borderColor: string
  headerBg: string
}

export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  { id: 'to_contact', label: 'To Contact', description: 'Contact now — a fit worth pursuing', dotColor: 'bg-stone', iconColor: 'text-stone', borderColor: 'border-t-stone', headerBg: 'bg-bone-raised' },
  { id: 'observe', label: 'Observe', description: 'Not a fit yet — watch, do not contact', dotColor: 'bg-status-warning', iconColor: 'text-status-warning', borderColor: 'border-t-status-warning', headerBg: 'bg-status-warning/[0.03]' },
  { id: 'waiting', label: 'Waiting', description: 'Sent, awaiting reply', dotColor: 'bg-cobalt', iconColor: 'text-cobalt', borderColor: 'border-t-cobalt', headerBg: 'bg-cobalt/[0.03]' },
  { id: 'follow_up_due', label: 'Follow-Up Due', description: 'Time to follow up', dotColor: 'bg-orange', iconColor: 'text-orange', borderColor: 'border-t-orange', headerBg: 'bg-orange/[0.03]' },
  { id: 'needs_reply', label: 'Needs Reply', description: 'They wrote back', dotColor: 'bg-orange', iconColor: 'text-orange', borderColor: 'border-t-orange', headerBg: 'bg-orange/[0.03]' },
]

export const TERMINAL_COLUMNS: PipelineColumnDef[] = [
  { id: 'done', label: 'Done', description: 'Won or closed', dotColor: 'bg-status-success', iconColor: 'text-status-success', borderColor: 'border-t-status-success', headerBg: 'bg-status-success/[0.03]' },
  { id: 'cold', label: 'Cold', description: 'Unresponsive — reactivate or archive', dotColor: 'bg-status-warning', iconColor: 'text-status-warning', borderColor: 'border-t-status-warning', headerBg: 'bg-status-warning/[0.03]' },
]

export function derivePipelineStage(lead: LeadRow, now: Date = new Date()): PipelineStage {
  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'dead' || lead.status === 'no') return 'done'
  if (lead.status === 'replied') return 'needs_reply'

  // OBSERVE / SKIP: not a fit yet. They never belong in "To Contact".
  const verdict = lead.verdict ?? null
  if (verdict === 'skip') return 'observe'
  if (verdict === 'research_more' && !relationshipHasStarted(lead)) return 'observe'

  // Cold/frozen leads go to the cold section regardless of their status
  if (lead.lifecycle && (lead.lifecycle.state === 'cold' || lead.lifecycle.state === 'frozen')) {
    return 'cold'
  }

  const hasOutbound = !!lead.lastOutboundAt
  const hasInbound = !!lead.lastInboundAt
  const hasRepliedSinceOutbound = hasInbound && hasOutbound && new Date(lead.lastInboundAt!).getTime() > new Date(lead.lastOutboundAt!).getTime()

  // An inbound-first lead is a live conversation, not a cold contact: with no
  // outbound it is waiting on our reply; once we have replied, we are waiting.
  const inboundFirst = lead.direction === 'inbound' && Boolean(lead.inboundMessage?.trim())
  if (inboundFirst && !hasOutbound) return 'needs_reply'
  if (inboundFirst && !hasRepliedSinceOutbound) return 'waiting'

  // Follow-up due: contacted but no reply, and enough time has passed. The
  // canonical policy is the one clock — this used to re-derive the cadence with
  // isFollowupDue, a second copy of the same arithmetic.
  if (hasOutbound && !hasRepliedSinceOutbound && lead.lastOutboundAt) {
    const policy = evaluateFollowUpPolicy({
      leadStatus: lead.status,
      lastOutboundAt: lead.lastOutboundAt,
      lastInboundAt: lead.lastInboundAt ?? null,
      followupCount: lead.followupCount ?? 0,
      channel: 'dm',
      now,
    })
    if (policy.eligible) return 'follow_up_due'
  }

  if (lead.status === 'followed_up') {
    if (hasRepliedSinceOutbound) return 'needs_reply'
    return 'waiting'
  }

  if (lead.status === 'contacted') {
    // Pipeline/detail parity: when connection is accepted but no DM has been
    // sent, the rep's next action is "Send first message" — the lead belongs
    // in to_contact (action required), not waiting.
    if (lead.connectionAcceptedAt && !lead.hasDmSent) return 'to_contact'
    if (hasOutbound && !hasInbound) return 'waiting'
    if (hasRepliedSinceOutbound) return 'needs_reply'
    return 'waiting'
  }

  return 'to_contact'
}

export type SortMode = 'score' | 'recent' | 'activity'

export function sortLeads(leads: LeadRow[], mode: SortMode): LeadRow[] {
  const sorted = [...leads]
  switch (mode) {
    case 'score':
      sorted.sort((a, b) => getComparableLeadScore(b) - getComparableLeadScore(a))
      break
    case 'recent':
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    case 'activity':
      sorted.sort((a, b) => {
        const aT = a.lastActivityAt ?? a.createdAt
        const bT = b.lastActivityAt ?? b.createdAt
        return new Date(bT).getTime() - new Date(aT).getTime()
      })
      break
  }
  return sorted
}

/**
 * Canonical priority language. This is a label over the canonical pipeline
 * state — never a raw scoring band, and never a second scoring model.
 */
export type LeadPriority = 'critical' | 'high' | 'normal' | 'watch'

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  watch: 'Watch',
}

export function leadPriority(lead: LeadRow): LeadPriority {
  const stage = derivePipelineStage(lead)
  if (stage === 'needs_reply') return 'critical'
  if (stage === 'follow_up_due') return 'high'
  if (stage === 'observe') return 'watch'
  return 'normal'
}

/**
 * Buyer intent, kept visually separate from the opportunity score and the
 * sender match. Null when the lead carries no buyer-intent evidence.
 */
export type LeadIntent = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

export function leadIntentLevel(lead: LeadRow): LeadIntent | null {
  const raw = lead.buyerIntent?.buyerIntentLevel
  if (typeof raw !== 'string') return null
  const value = raw.trim().toUpperCase()
  if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' || value === 'UNKNOWN') return value
  return null
}

const PIPELINE_STAGE_IDS: PipelineStage[] = ['to_contact', 'observe', 'waiting', 'follow_up_due', 'needs_reply', 'done', 'cold']

export function isPipelineStage(value: string | null | undefined): value is PipelineStage {
  return typeof value === 'string' && PIPELINE_STAGE_IDS.includes(value as PipelineStage)
}

/**
 * The one stage vocabulary. The Leads table, the Pipeline board and Lead Detail
 * all render this — a lead must never be called "Qualified" in one surface and
 * "To Contact" in another.
 */
export const STAGE_LABELS: Record<PipelineStage, string> = {
  to_contact: 'Qualified',
  waiting: 'Connection sent',
  needs_reply: 'Conversation',
  follow_up_due: 'Follow-up due',
  observe: 'Watch',
  done: 'Won',
  cold: 'Cold',
}

/** The canonical next action for a lead. Never derived per page. */
export function leadNextAction(lead: LeadRow): { label: string; href: string } {
  const stage = derivePipelineStage(lead)
  switch (stage) {
    case 'needs_reply':
      return { label: 'Reply', href: `/leads/${lead.id}?tab=conversation` }
    case 'follow_up_due':
      return { label: 'Follow up', href: `/leads/${lead.id}?tab=conversation` }
    case 'to_contact':
      return lead.connectionAcceptedAt && !lead.hasDmSent
        ? { label: 'Send first message', href: `/leads/${lead.id}` }
        : { label: 'Send connection', href: `/leads/${lead.id}` }
    case 'observe':
      return { label: 'Research', href: `/leads/${lead.id}` }
    case 'cold':
      return { label: 'Reactivate', href: `/leads/${lead.id}` }
    case 'done':
      return { label: '—', href: `/leads/${lead.id}` }
    default:
      return { label: 'Watch', href: `/leads/${lead.id}` }
  }
}

/**
 * Canonical stuck signals for the pipeline. Only existing canonical state is
 * used — no new model, and never a locally-derived stage.
 */
export type StuckSignal = 'reply_waiting' | 'followup_overdue' | 'no_profile' | 'no_next_action'

export const STUCK_SIGNAL_LABELS: Record<StuckSignal, string> = {
  reply_waiting: 'Reply waiting',
  followup_overdue: 'Follow-up overdue',
  no_profile: 'No profile',
  no_next_action: 'No next action',
}

export function leadStuckSignals(lead: LeadRow): StuckSignal[] {
  const signals: StuckSignal[] = []
  const stage = derivePipelineStage(lead)
  if (stage === 'needs_reply') signals.push('reply_waiting')
  if (stage === 'follow_up_due') signals.push('followup_overdue')
  if (!lead.senderProfileName) signals.push('no_profile')
  if (!lead.lastOutboundAt && stage !== 'done' && stage !== 'cold') signals.push('no_next_action')
  return signals
}

/**
 * When the canonical follow-up clock says the next action is due. The policy is
 * the one authority; this only formats it. `nextFollowupAt` is null exactly when
 * the follow-up is already due, so eligibility — not the timestamp — is the
 * "due now" signal.
 */
export function leadDue(
  lead: LeadRow,
  now: number,
): { label: string; overdue: boolean } | null {
  if (!lead.lastOutboundAt) return null
  const policy = evaluateFollowUpPolicy({
    leadStatus: lead.status,
    lastOutboundAt: lead.lastOutboundAt,
    lastInboundAt: lead.lastInboundAt ?? null,
    followupCount: lead.followupCount ?? 0,
    channel: 'dm',
    now: new Date(now),
  })
  if (policy.eligible) return { label: 'Due now', overdue: true }
  if (!policy.nextFollowupAt) return null
  const diff = new Date(policy.nextFollowupAt).getTime() - now
  if (diff <= 0) return { label: 'Due now', overdue: true }
  const label = diff < 3_600_000
    ? `${Math.max(1, Math.round(diff / 60_000))}m`
    : diff < 86_400_000
      ? `${Math.max(1, Math.round(diff / 3_600_000))}h`
      : `${Math.max(1, Math.round(diff / 86_400_000))}d`
  return { label, overdue: false }
}

/** Derived sorts run over the enriched set; the database only orders by columns. */
export function isDerivedSort(sort: string | undefined): boolean {
  return sort === 'activity' || sort === 'score'
}

/**
 * One sort authority for the table. Mirrors the database ordering for the
 * column sorts so the table and the board never disagree.
 */
export function sortLeadRows(
  leads: LeadRow[],
  sort?: string,
  dir: 'asc' | 'desc' = 'desc',
): LeadRow[] {
  const direction = dir === 'asc' ? 1 : -1
  const sorted = [...leads]
  const byTime = (lead: LeadRow) => new Date(lead.lastActivityAt ?? lead.createdAt).getTime()
  switch (sort) {
    case 'score':
      sorted.sort((a, b) => (getComparableLeadScore(b) - getComparableLeadScore(a)) * direction)
      break
    case 'recent':
      sorted.sort((a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction)
      break
    case 'activity':
      sorted.sort((a, b) => (byTime(a) - byTime(b)) * direction)
      break
    case 'company':
      sorted.sort((a, b) => a.company.localeCompare(b.company) * direction)
      break
    case 'name':
      sorted.sort((a, b) => (a.contactName ?? '').localeCompare(b.contactName ?? '') * direction)
      break
    default:
      sorted.sort((a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction)
  }
  return sorted
}

export function filterLeads(leads: LeadRow[], search: string): LeadRow[] {
  if (!search.trim()) return leads
  const q = search.toLowerCase()
  return leads.filter((lead) => {
    const hay = [
      lead.company,
      lead.contactName ?? '',
      lead.signalEvidence ?? '',
      lead.companyKey,
      lead.senderProfileName ?? '',
      lead.ownerName ?? '',
    ].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function truncate(text: string | null | undefined, max: number = 80): string | null {
  if (!text) return null
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  to_contact: 'To Contact',
  observe: 'Observe',
  needs_reply: 'Needs Reply',
  follow_up_due: 'Follow-Up',
  waiting: 'Waiting',
  done: 'Done',
  cold: 'Cold',
}

/** Empty-state copy per pipeline stage (no search involved). */
export const STAGE_EMPTY_MESSAGES: Record<PipelineStage, { title: string; hint: string }> = {
  to_contact: { title: 'No leads to contact.', hint: 'New leads appear here.' },
  observe: { title: 'No leads to observe.', hint: 'Opportunities that are not a fit yet appear here — watch, do not contact.' },
  waiting: { title: 'No leads are waiting here.', hint: 'Leads you have messaged show here until they answer.' },
  follow_up_due: { title: 'No follow-ups due.', hint: 'Leads come back here when a follow-up is due.' },
  needs_reply: { title: 'No replies waiting for you.', hint: 'Client replies land here.' },
  done: { title: 'No closed leads yet.', hint: 'Won and lost leads show here.' },
  cold: { title: 'No cold leads.', hint: 'Unresponsive leads appear here.' },
}

export interface PipelineEmptyState {
  kind: 'search' | 'stage' | 'all'
  title: string
  hint: string | null
}

/**
 * The one place that decides what an empty pipeline view says. A search
 * with no results is about the search; an empty stage is about the stage;
 * the two must never borrow each other's copy.
 */
export interface LeadsBoardEmptyState {
  kind: 'none' | 'filter' | 'search'
  title: string
  hint: string
}

/**
 * The one place that decides what an empty leads board says. A board with leads
 * must never say "No leads yet" just because the selected filter or search
 * matched none (REL-QA-010). Returns null when there is content to render.
 */
export function resolveLeadsBoardEmptyState(input: {
  leadsCount: number
  filteredCount: number
  search: string
}): LeadsBoardEmptyState | null {
  if (input.filteredCount > 0) return null
  const query = input.search.trim()
  if (query) {
    return { kind: 'search', title: 'No leads match your search.', hint: 'Try a different search term.' }
  }
  if (input.leadsCount === 0) {
    return { kind: 'none', title: 'No leads yet.', hint: 'Find prospects and save them to start your outreach.' }
  }
  return {
    kind: 'filter',
    title: 'No leads in this view.',
    hint: 'You have leads in other views. Switch the filter above to see them.',
  }
}

export function resolvePipelineEmptyState(input: { stage: PipelineStage | 'all'; query: string }): PipelineEmptyState {
  const query = input.query.trim()
  if (query) {
    const where = input.stage === 'all' ? '' : ` in ${PIPELINE_STAGE_LABELS[input.stage]}`
    return { kind: 'search', title: `No leads match "${query}"${where}.`, hint: 'Try a different name, company or title.' }
  }
  if (input.stage === 'all') return { kind: 'all', title: 'No leads yet.', hint: 'Create or import a lead to start your pipeline.' }
  const copy = STAGE_EMPTY_MESSAGES[input.stage]
  return { kind: 'stage', title: copy.title, hint: copy.hint }
}

/* ─── saved views + URL query state ─── */

export const LEADS_PAGE_SIZE = 50
export const LEADS_MAX_PAGE_SIZE = 200

export interface LeadsQuery extends LeadsPageInput {
  stage?: string
  priority?: string
  view?: string
  /** Rep: ignored. Manager: `team` expands to managed owners. Admin: `org` is default. */
  scope?: 'profile' | 'team' | 'org'
}

export const LEADS_VIEWS = [
  { id: 'all', label: 'All', hint: 'Every active lead for the selected profile.' },
  { id: 'needs_reply', label: 'Needs reply', hint: 'A prospect wrote back and is waiting on you.' },
  { id: 'follow_ups', label: 'Follow-ups', hint: 'The canonical follow-up clock says it is time to re-engage.' },
  { id: 'high_priority', label: 'High priority', hint: 'Follow-ups that are due now — timing matters.' },
  { id: 'new', label: 'New', hint: 'Captured but not contacted yet.' },
  { id: 'watch', label: 'Watch', hint: 'Not a fit yet — observe, do not contact.' },
  { id: 'won', label: 'Won', hint: 'Closed as won.' },
  { id: 'lost', label: 'Lost', hint: 'Closed as lost.' },
] as const

export type LeadsViewId = (typeof LEADS_VIEWS)[number]['id']

/** A saved view is a preset of query params — never a stored filter. */
export function viewToQuery(view: string): LeadsQuery {
  switch (view) {
    case 'needs_reply':
      return { stage: 'needs_reply' }
    case 'follow_ups':
      return { stage: 'follow_up_due' }
    case 'high_priority':
      return { priority: 'high' }
    case 'new':
      return { status: 'new' }
    case 'watch':
      return { stage: 'observe' }
    case 'won':
      return { status: 'won' }
    case 'lost':
      return { status: 'lost' }
    default:
      return {}
  }
}

export function isLeadsViewId(value: string | undefined): value is LeadsViewId {
  return LEADS_VIEWS.some((view) => view.id === value)
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * URL state is the only filter state. A saved view supplies a preset; explicit
 * params win over it, so `?view=needs_reply&q=acme` is a filtered view.
 */
export function parseLeadsQuery(
  params: Record<string, string | string[] | undefined>,
): LeadsQuery {
  const preset = viewToQuery(firstParam(params.view) ?? 'all')
  return {
    ...preset,
    q: firstParam(params.q)?.trim() || undefined,
    stage: firstParam(params.stage) ?? preset.stage,
    priority: firstParam(params.priority) ?? preset.priority,
    owner: firstParam(params.owner) ?? preset.owner,
    profile: firstParam(params.profile) ?? preset.profile,
    source: firstParam(params.source) ?? preset.source,
    status: firstParam(params.status) ?? preset.status,
    sort: firstParam(params.sort) ?? preset.sort,
    dir: firstParam(params.dir) === 'asc' ? 'asc' : 'desc',
    scope: (() => {
      const raw = firstParam(params.scope)
      return raw === 'team' || raw === 'org' || raw === 'profile' ? raw : undefined
    })(),
    page: Math.max(1, Math.floor(Number(firstParam(params.page)) || 1)),
    pageSize: Math.min(
      LEADS_MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(firstParam(params.pageSize)) || LEADS_PAGE_SIZE)),
    ),
  }
}
