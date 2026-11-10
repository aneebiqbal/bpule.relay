import type { DbClient } from '@/lib/db/types'
/**
 * Right-hand intelligence panel for /chats — loaded only for the selected
 * conversation (one lead, one state row, its open tasks). No new scoring:
 * score, qualification, buyer intent and sales thesis are read from the
 * canonical intelligence JSON paths; waiting state and next action come from
 * deriveConversationRow (the parity rule shared with Rep 360 / Accounts).
 */
import type { AuthContext } from '@/lib/auth/organization'
import { repInScope, type OperationalScope } from '@/lib/operations/scope'
import { deriveConversationRow, type ConversationRow } from '@/lib/operations/conversations'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { loadTimeline, type TimelineRow } from '@/lib/operations/activity'

export interface SalesThesisView {
  whyThisAccount: string | null
  likelyOpportunity: string | null
  whyThisSender: string | null
  bestEntryPoint: string | null
  missingEvidence: string[]
  risks: string[]
  confidence: string | null
}

export interface ChatIntelligence {
  leadId: string
  person: string
  title: string | null
  company: string | null
  companyKey: string | null
  url: string | null
  ownerRepId: string | null
  ownerName: string | null
  profileId: string | null
  /** Channel identity the lead sends as (revenue_identities.id). */
  revenueIdentityId: string | null
  profileName: string | null
  /** Raw stored source — display parity with the queue row and history. */
  sourceRaw?: string | null
  direction?: 'inbound' | 'outbound' | null
  leadCreatedAt: string | null
  /** Internal note count for the collapsed context section. null = unavailable. */
  noteCount: number | null
  /** Canonical lead history (action events only), newest first. */
  history: TimelineRow[]
  score: number | null
  qualification: string | null
  buyerIntent: string | null
  stage: string | null
  status: string | null
  conversation: ConversationRow | null
  thesis: SalesThesisView | null
  facts: {
    need: string | null
    timeline: string | null
    budget: string | null
    decisionMaker: string | null
    nextStepNotes: string | null
    openQuestions: string[]
    objections: string[]
    buyingSignals: string[]
  } | null
  lastClientIntent: string | null
  openTasks: Array<{
    id: string
    title: string
    priority: string
    dueAt: string | null
    status: string
    assigneeName: string | null
  }> | null
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : []
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Pure: normalise the canonical sales thesis JSON. Unknown shapes → null. */
export function toThesisView(raw: unknown): SalesThesisView | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  const view: SalesThesisView = {
    whyThisAccount: str(t.whyThisAccount),
    likelyOpportunity: str(t.likelyOpportunity),
    whyThisSender: str(t.whyThisSender),
    bestEntryPoint: str(t.bestEntryPoint),
    missingEvidence: strings(t.missingEvidence),
    risks: strings(t.risks),
    confidence: str(t.confidence),
  }
  const empty = !view.whyThisAccount && !view.likelyOpportunity && !view.bestEntryPoint && view.missingEvidence.length === 0 && view.risks.length === 0
  return empty ? null : view
}

/** Pure: buyer intent level from the canonical JSON (same rule as the Leads table). */
export function buyerIntentLevel(raw: unknown): string | null {
  const level = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).buyerIntentLevel : null
  if (typeof level !== 'string') return null
  const v = level.trim().toUpperCase()
  return ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(v) ? v : null
}

export async function loadChatIntelligence(
  client: DbClient,
  auth: AuthContext,
  scope: OperationalScope,
  leadId: string,
  opts: { tasks: boolean },
  now = Date.now(),
): Promise<ChatIntelligence | null> {
  const { data: lead, error } = await client
    .from('leads')
    .select(
      'id, contact_name, contact_title, company, company_key, url, owner_rep_id, revenue_identity_id, status, canonical_score, ' +
        'source, direction, created_at, ' +
        'buyer_intent:canonical_intelligence->buyerIntent, qualification:canonical_intelligence->>qualification, thesis:canonical_intelligence->salesThesis',
    )
    .eq('organization_id', auth.orgId)
    .eq('id', leadId)
    .maybeSingle()
  if (error || !lead) return null
  const row = lead as unknown as Record<string, unknown>
  const ownerRepId = (row.owner_rep_id as string | null) ?? null
  // Out-of-scope leads are indistinguishable from missing ones.
  if (scope.repIds !== null && !(ownerRepId && repInScope(scope, ownerRepId))) return null

  const identityId = (row.revenue_identity_id as string | null) ?? null
  const [stateRes, ownerRes, identityRes, tasksRes, noteCountRes, historyRes] = await Promise.all([
    client
      .from('conversation_states')
      .select('stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at, facts:memory->facts, analysis:memory->lastClientAnalysis')
      .eq('organization_id', auth.orgId)
      .eq('lead_id', leadId)
      .maybeSingle()
      .then((r) => (r.error ? client.from('conversation_states').select('stage, last_sent_at, last_reply_at, next_followup_at, won_at, lost_at').eq('organization_id', auth.orgId).eq('lead_id', leadId).maybeSingle() : r)),
    ownerRepId ? client.from('reps').select('name').eq('organization_id', auth.orgId).eq('id', ownerRepId).maybeSingle() : Promise.resolve({ data: null }),
    identityId ? client.from('revenue_identities').select('identity_name').eq('organization_id', auth.orgId).eq('id', identityId).maybeSingle() : Promise.resolve({ data: null }),
    opts.tasks
      ? client
          .from('assigned_tasks')
          .select('id, title, priority, due_at, status, assignee_rep_id')
          .eq('organization_id', auth.orgId)
          .eq('lead_id', leadId)
          .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(10)
      : Promise.resolve({ data: null, error: null }),
    (async () => {
      try {
        return await client
          .from('internal_notes')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', auth.orgId)
          .eq('subject_type', 'LEAD')
          .eq('subject_id', leadId)
          .is('deleted_at', null)
      } catch {
        return { data: null, count: null, error: null }
      }
    })(),
    loadTimeline(client, { orgId: auth.orgId, repIds: null, leadIds: [leadId], limit: 10 }).catch(() => []),
  ])

  const state = (stateRes.data ?? null) as Record<string, unknown> | null
  const ownerName = ((ownerRes.data as { name?: string } | null)?.name) ?? null
  const profileName = ((identityRes.data as { identity_name?: string } | null)?.identity_name) ?? null
  const facts = state?.facts && typeof state.facts === 'object' ? (state.facts as Record<string, unknown>) : null
  const analysis = state?.analysis && typeof state.analysis === 'object' ? (state.analysis as Record<string, unknown>) : null

  const conversation = deriveConversationRow(
    {
      id: leadId,
      contactName: (row.contact_name as string | null) ?? null,
      company: (row.company as string | null) ?? null,
      companyKey: (row.company_key as string | null) ?? null,
      ownerRepId,
      profileName,
      status: (row.status as string | null) ?? null,
    },
    state
      ? {
          stage: (state.stage as string | null) ?? null,
          lastSentAt: (state.last_sent_at as string | null) ?? null,
          lastReplyAt: (state.last_reply_at as string | null) ?? null,
          nextFollowupAt: (state.next_followup_at as string | null) ?? null,
          wonAt: (state.won_at as string | null) ?? null,
          lostAt: (state.lost_at as string | null) ?? null,
        }
      : null,
    ownerName,
    now,
  )

  const taskError = (tasksRes as { error?: unknown }).error
  const tasksUnavailable = Boolean(taskError && isMissingRelation(taskError))
  const taskRows = !opts.tasks || tasksUnavailable
    ? []
    : (((tasksRes as { data?: unknown }).data ?? []) as Array<{
        id: string
        title: string
        priority: string
        due_at: string | null
        status: string
        assignee_rep_id: string | null
      }>)
  const assigneeIds = [...new Set(taskRows.map((t) => t.assignee_rep_id).filter(Boolean))] as string[]
  const assigneeRes = assigneeIds.length
    ? await client.from('reps').select('id, name').eq('organization_id', auth.orgId).in('id', assigneeIds)
    : { data: [] as Array<{ id: string; name: string }>, error: null }
  const assigneeRows = ((assigneeRes as { data?: unknown }).data ?? []) as Array<{ id: string; name: string }>
  const assigneeNames = new Map(assigneeRows.map((r) => [r.id, r.name]))
  const openTasks = !opts.tasks || tasksUnavailable
    ? null
    : taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueAt: t.due_at,
        status: t.status,
        assigneeName: t.assignee_rep_id ? assigneeNames.get(t.assignee_rep_id) ?? null : null,
      }))
  const noteCount = (noteCountRes as { count?: number | null }).count ?? null
  // History is the canonical action timeline; tasks and notes have their own
  // sections, so they never appear twice.
  const history = (historyRes ?? []).filter((r) => r.category !== 'task' && r.category !== 'note')

  return {
    leadId,
    person: ((row.contact_name as string | null) ?? '').trim() || 'Unnamed contact',
    title: (row.contact_title as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    companyKey: (row.company_key as string | null) ?? null,
    url: (row.url as string | null) ?? null,
    ownerRepId,
    ownerName,
    profileId: identityId,
    revenueIdentityId: identityId,
    profileName,
    sourceRaw: (row.source as string | null) ?? null,
    direction: row.direction === 'inbound' ? 'inbound' : 'outbound',
    leadCreatedAt: (row.created_at as string | null) ?? null,
    noteCount,
    history,
    score: (row.canonical_score as number | null) ?? null,
    qualification: (row.qualification as string | null) ?? null,
    buyerIntent: buyerIntentLevel(row.buyer_intent),
    stage: (state?.stage as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    conversation,
    thesis: toThesisView(row.thesis),
    facts: facts
      ? {
          need: str(facts.need),
          timeline: str(facts.timeline),
          budget: str(facts.budget),
          decisionMaker: str(facts.decisionMaker),
          nextStepNotes: str(facts.nextStepNotes),
          openQuestions: strings(facts.openQuestions),
          objections: strings(facts.objections),
          buyingSignals: strings(facts.buyingSignals),
        }
      : null,
    lastClientIntent: analysis ? str(analysis.intent) : null,
    openTasks,
  }
}
