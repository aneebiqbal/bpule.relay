import type { DbClient } from '@/lib/db/types'
/**
 * One operational timeline (Phase 8.7 / 8.17 / 8.20).
 *
 * Sources: action_events (sales execution), task_events (task lifecycle),
 * internal_notes (manager notes). UI noise — drafts prepared, recommendations
 * shown, jobs scraped — is excluded by construction: only types in
 * ACTION_EVENT_META are mapped.
 *
 * Mapping is pure; the loader batches enrichment (no per-row reads) and never
 * selects message bodies, metadata JSON or AI traces.
 */
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { sourceBucket, type OpsSource } from '@/lib/operations/filters'

export type ActivityCategory = 'outreach' | 'conversation' | 'pipeline' | 'outcome' | 'task' | 'note'

interface EventMeta {
  label: string
  category: ActivityCategory
}

/** Operational action types. Anything not listed is not a timeline event. */
export const ACTION_EVENT_META: Record<string, EventMeta> = {
  LEAD_EXTRACTED: { label: 'Lead created', category: 'pipeline' },
  OPPORTUNITY_CREATED: { label: 'Opportunity created', category: 'pipeline' },
  CONNECTION_SENT: { label: 'Connection sent', category: 'outreach' },
  DM_SENT: { label: 'Message sent', category: 'outreach' },
  FOLLOWUP_SENT: { label: 'Follow-up sent', category: 'outreach' },
  REPLY_SENT: { label: 'Reply sent', category: 'conversation' },
  REPLY_RECEIVED: { label: 'Inbound received', category: 'conversation' },
  MEETING_BOOKED: { label: 'Meeting booked', category: 'conversation' },
  UPWORK_PROPOSAL_PREPARED: { label: 'Proposal prepared', category: 'pipeline' },
  UPWORK_APPLIED: { label: 'Applied on Upwork', category: 'outreach' },
  LEAD_REFERRED: { label: 'Lead reassigned', category: 'pipeline' },
  CLIENT_WON: { label: 'Won', category: 'outcome' },
  LEAD_LOST: { label: 'Lost', category: 'outcome' },
  CLIENT_LOST: { label: 'Lost', category: 'outcome' },
  LEAD_ARCHIVED: { label: 'Archived', category: 'pipeline' },
}

export const TASK_EVENT_META: Record<string, EventMeta> = {
  TASK_CREATED: { label: 'Task assigned', category: 'task' },
  TASK_REASSIGNED: { label: 'Task reassigned', category: 'task' },
  TASK_STARTED: { label: 'Task started', category: 'task' },
  TASK_COMPLETED: { label: 'Task completed', category: 'task' },
  TASK_CANCELLED: { label: 'Task cancelled', category: 'task' },
  TASK_RESCHEDULED: { label: 'Task rescheduled', category: 'task' },
}

export const OPERATIONAL_ACTION_TYPES = Object.keys(ACTION_EVENT_META)

/** Filter groups that expand to several action types (target drill-downs). */
export const ACTION_EVENT_GROUPS: Record<string, string[]> = {
  MESSAGES_SENT: ['DM_SENT', 'FOLLOWUP_SENT', 'REPLY_SENT'],
  LEAD_LOST: ['LEAD_LOST', 'CLIENT_LOST'],
}

/** Filter options for the Activity Center event-type select. */
export const ACTIVITY_EVENT_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'MESSAGES_SENT', label: 'Messages sent (all)' },
  ...Object.entries(ACTION_EVENT_META)
    // CLIENT_LOST folds into "Lost".
    .filter(([key]) => key !== 'CLIENT_LOST')
    .map(([value, meta]) => ({ value, label: meta.label })),
  { value: 'TASKS', label: 'Task events' },
  { value: 'NOTES', label: 'Internal notes' },
]

export interface TimelineRow {
  id: string
  at: string
  actorRepId: string | null
  actorName: string | null
  profileName: string | null
  leadId: string | null
  leadLabel: string | null
  company: string | null
  companyKey: string | null
  event: string
  category: ActivityCategory
  /** Short outcome text, e.g. "Failed", "Sent", task title. */
  result: string | null
  href: string | null
  /** Lead source bucket; Upwork job events are 'upwork'; unknown is null. */
  source: OpsSource | null
}

export interface ActionEventRow {
  id: string
  actor_id: string | null
  action_type: string
  execution_status: string | null
  channel: string | null
  lead_id: string | null
  job_id: string | null
  occurred_at: string
}

export interface TaskEventRow {
  id: string
  task_id: string
  event_type: string
  actor_rep_id: string | null
  created_at: string
}

export interface NoteRow {
  id: string
  subject_type: string
  subject_id: string
  author_rep_id: string
  body: string
  created_at: string
}

export interface TimelineLookups {
  reps: Map<string, string>
  leads: Map<string, { label: string; company: string | null; companyKey: string | null; profileName: string | null; source?: OpsSource }>
  tasks: Map<string, { title: string; leadId: string | null; assigneeRepId: string }>
}

export function mapActionEvent(row: ActionEventRow, lookups: TimelineLookups): TimelineRow | null {
  const meta = ACTION_EVENT_META[row.action_type]
  if (!meta) return null
  const lead = row.lead_id ? lookups.leads.get(row.lead_id) : undefined
  const failed = row.execution_status === 'failed'
  return {
    id: `ae:${row.id}`,
    at: row.occurred_at,
    actorRepId: row.actor_id,
    actorName: row.actor_id ? lookups.reps.get(row.actor_id) ?? null : null,
    profileName: lead?.profileName ?? null,
    leadId: row.lead_id,
    leadLabel: lead?.label ?? null,
    company: lead?.company ?? null,
    companyKey: lead?.companyKey ?? null,
    event: meta.label,
    category: meta.category,
    result: failed ? 'Failed' : row.channel ? channelLabel(row.channel) : null,
    href: row.lead_id ? `/leads/${row.lead_id}` : row.job_id ? `/upwork/${row.job_id}` : null,
    source: lead?.source ?? (row.job_id || row.action_type.startsWith('UPWORK_') ? 'upwork' : null),
  }
}

export function mapTaskEvent(row: TaskEventRow, lookups: TimelineLookups): TimelineRow | null {
  const meta = TASK_EVENT_META[row.event_type]
  if (!meta) return null
  const task = lookups.tasks.get(row.task_id)
  const lead = task?.leadId ? lookups.leads.get(task.leadId) : undefined
  return {
    id: `te:${row.id}`,
    at: row.created_at,
    actorRepId: row.actor_rep_id,
    actorName: row.actor_rep_id ? lookups.reps.get(row.actor_rep_id) ?? null : null,
    profileName: lead?.profileName ?? null,
    leadId: task?.leadId ?? null,
    leadLabel: lead?.label ?? null,
    company: lead?.company ?? null,
    companyKey: lead?.companyKey ?? null,
    event: meta.label,
    category: 'task',
    result: task?.title ?? null,
    href: `/tasks?task=assigned:${row.task_id}`,
    source: lead?.source ?? null,
  }
}

export function mapNote(row: NoteRow, lookups: TimelineLookups): TimelineRow {
  const lead = row.subject_type === 'LEAD' ? lookups.leads.get(row.subject_id) : undefined
  return {
    id: `nt:${row.id}`,
    at: row.created_at,
    actorRepId: row.author_rep_id,
    actorName: lookups.reps.get(row.author_rep_id) ?? null,
    profileName: lead?.profileName ?? null,
    leadId: row.subject_type === 'LEAD' ? row.subject_id : null,
    leadLabel: lead?.label ?? null,
    company: lead?.company ?? (row.subject_type === 'ACCOUNT' ? row.subject_id : null),
    companyKey: lead?.companyKey ?? (row.subject_type === 'ACCOUNT' ? row.subject_id : null),
    event: 'Internal note',
    category: 'note',
    result: row.body.length > 140 ? `${row.body.slice(0, 137)}…` : row.body,
    href:
      row.subject_type === 'LEAD'
        ? `/leads/${row.subject_id}`
        : row.subject_type === 'ACCOUNT'
          ? `/accounts/${encodeURIComponent(row.subject_id)}?tab=activity`
          : row.subject_type === 'REP'
            ? `/team/${row.subject_id}?tab=activity`
            : null,
    source: lead?.source ?? null,
  }
}

/** Newest first, stable on id, de-duplicated, capped. */
export function mergeTimeline(rows: Array<TimelineRow | null>, limit: number): TimelineRow[] {
  const seen = new Set<string>()
  const out: TimelineRow[] = []
  for (const row of rows) {
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  out.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1))
  return out.slice(0, limit)
}

function channelLabel(channel: string): string {
  switch (channel) {
    case 'linkedin':
      return 'LinkedIn'
    case 'email':
      return 'Email'
    case 'dm':
      return 'DM'
    case 'upwork':
      return 'Upwork'
    default:
      return channel
  }
}

export { leadLabel } from '@/lib/operations/labels'
import { leadLabel } from '@/lib/operations/labels'

// ─── Loader ──────────────────────────────────────────────────────────────────

export interface TimelineQuery {
  orgId: string
  /** null = whole org (admin). [] = nothing. */
  repIds: string[] | null
  leadIds?: string[] | null
  start?: string | null
  end?: string | null
  /** Action type, 'TASKS' or 'NOTES'. */
  event?: string | null
  /** Restrict to leads sent from this revenue identity. */
  profileId?: string | null
  /** Restrict to a lead source bucket. Task / note rows without a lead are dropped. */
  source?: OpsSource | null
  limit?: number
}

const LEAD_LOOKUP_COLUMNS = 'id, company, company_key, contact_name, revenue_identity_id, source'

export async function loadTimeline(client: DbClient, query: TimelineQuery): Promise<TimelineRow[]> {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 300)
  if (query.repIds && query.repIds.length === 0) return []
  if (query.leadIds && query.leadIds.length === 0) return []

  const wantActions = !query.event || ACTION_EVENT_META[query.event] !== undefined || ACTION_EVENT_GROUPS[query.event] !== undefined
  const wantTasks = (!query.event || query.event === 'TASKS') && !query.profileId
  const wantNotes = (!query.event || query.event === 'NOTES') && !query.profileId

  const actionTypes = query.event
    ? ACTION_EVENT_GROUPS[query.event] ?? (ACTION_EVENT_META[query.event] ? [query.event] : OPERATIONAL_ACTION_TYPES)
    : OPERATIONAL_ACTION_TYPES

  const actionsPromise: Promise<ActionEventRow[]> = wantActions
    ? (async () => {
        let q = client
          .from('action_events')
          .select('id, actor_id, action_type, execution_status, channel, lead_id, job_id, occurred_at')
          .eq('organization_id', query.orgId)
          .in('action_type', actionTypes)
          .order('occurred_at', { ascending: false })
          .limit(limit)
        if (query.start) q = q.gte('occurred_at', query.start)
        if (query.end) q = q.lt('occurred_at', query.end)
        if (query.repIds) q = q.in('actor_id', query.repIds)
        if (query.leadIds) q = q.in('lead_id', query.leadIds)
        const { data, error } = await q
        if (error) {
          if (isMissingRelation(error)) return []
          throw error
        }
        return (data ?? []) as ActionEventRow[]
      })()
    : Promise.resolve([])

  const tasksPromise: Promise<{ events: TaskEventRow[]; tasks: TimelineLookups['tasks'] }> = wantTasks
    ? loadTaskEvents(client, query, limit)
    : Promise.resolve({ events: [], tasks: new Map() })

  const notesPromise: Promise<NoteRow[]> = wantNotes ? loadNoteRows(client, query, limit) : Promise.resolve([])

  const [actions, taskBundle, notes] = await Promise.all([actionsPromise, tasksPromise, notesPromise])

  let filteredActions = actions
  const leadIds = new Set<string>()
  for (const a of actions) if (a.lead_id) leadIds.add(a.lead_id)
  for (const t of taskBundle.tasks.values()) if (t.leadId) leadIds.add(t.leadId)
  for (const n of notes) if (n.subject_type === 'LEAD') leadIds.add(n.subject_id)

  const repIds = new Set<string>()
  for (const a of actions) if (a.actor_id) repIds.add(a.actor_id)
  for (const e of taskBundle.events) if (e.actor_rep_id) repIds.add(e.actor_rep_id)
  for (const n of notes) repIds.add(n.author_rep_id)

  const [leadRows, repRows] = await Promise.all([
    chunkedIn<{ id: string; company: string | null; company_key: string | null; contact_name: string | null; revenue_identity_id: string | null; source: string | null }>(
      [...leadIds],
      (chunk) => client.from('leads').select(LEAD_LOOKUP_COLUMNS).eq('organization_id', query.orgId).in('id', chunk),
    ),
    chunkedIn<{ id: string; name: string }>(
      [...repIds],
      (chunk) => client.from('reps').select('id, name').eq('organization_id', query.orgId).in('id', chunk),
    ),
  ])

  if (query.profileId) {
    const allowed = new Set(leadRows.filter((l) => l.revenue_identity_id === query.profileId).map((l) => l.id))
    filteredActions = actions.filter((a) => a.lead_id && allowed.has(a.lead_id))
  }

  const identityIds = [...new Set(leadRows.map((l) => l.revenue_identity_id).filter(Boolean))] as string[]
  const identityRows = await chunkedIn<{ id: string; identity_name: string }>(identityIds, (chunk) =>
    client.from('revenue_identities').select('id, identity_name').eq('organization_id', query.orgId).in('id', chunk),
  ).catch(() => [] as Array<{ id: string; identity_name: string }>)
  const identityName = new Map(identityRows.map((r) => [r.id, r.identity_name]))

  const lookups: TimelineLookups = {
    reps: new Map(repRows.map((r) => [r.id, r.name])),
    leads: new Map(
      leadRows.map((l) => [
        l.id,
        {
          label: leadLabel(l.contact_name, l.company),
          company: l.company,
          companyKey: l.company_key,
          profileName: l.revenue_identity_id ? identityName.get(l.revenue_identity_id) ?? null : null,
          source: sourceBucket(l.source),
        },
      ]),
    ),
    tasks: taskBundle.tasks,
  }

  const merged = mergeTimeline(
    [
      ...filteredActions.map((row) => mapActionEvent(row, lookups)),
      ...taskBundle.events.map((row) => mapTaskEvent(row, lookups)),
      ...notes.map((row) => mapNote(row, lookups)),
    ],
    limit,
  )
  return query.source ? merged.filter((row) => row.source === query.source) : merged
}

async function loadTaskEvents(
  client: DbClient,
  query: TimelineQuery,
  limit: number,
): Promise<{ events: TaskEventRow[]; tasks: TimelineLookups['tasks'] }> {
  // Scope by the task's assignee or the event actor — both must be visible.
  let taskQuery = client
    .from('assigned_tasks')
    .select('id, title, lead_id, assignee_rep_id')
    .eq('organization_id', query.orgId)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (query.repIds) taskQuery = taskQuery.in('assignee_rep_id', query.repIds)
  if (query.leadIds) taskQuery = taskQuery.in('lead_id', query.leadIds)
  const { data: taskRows, error: taskError } = await taskQuery
  if (taskError) {
    if (isMissingRelation(taskError)) return { events: [], tasks: new Map() }
    throw taskError
  }
  const tasks = new Map(
    (taskRows ?? []).map((t: { id: string; title: string; lead_id: string | null; assignee_rep_id: string }) => [
      t.id,
      { title: t.title, leadId: t.lead_id, assigneeRepId: t.assignee_rep_id },
    ]),
  )
  if (tasks.size === 0) return { events: [], tasks }

  const events = await chunkedIn<TaskEventRow>([...tasks.keys()], (chunk) => {
    let q = client
      .from('task_events')
      .select('id, task_id, event_type, actor_rep_id, created_at')
      .eq('organization_id', query.orgId)
      .in('task_id', chunk)
      .neq('event_type', 'TASK_ASSIGNED')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (query.start) q = q.gte('created_at', query.start)
    if (query.end) q = q.lt('created_at', query.end)
    return q
  }).catch((err) => {
    if (isMissingRelation(err)) return [] as TaskEventRow[]
    throw err
  })
  return { events, tasks }
}

async function loadNoteRows(client: DbClient, query: TimelineQuery, limit: number): Promise<NoteRow[]> {
  let q = client
    .from('internal_notes')
    .select('id, subject_type, subject_id, author_rep_id, body, created_at')
    .eq('organization_id', query.orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (query.start) q = q.gte('created_at', query.start)
  if (query.end) q = q.lt('created_at', query.end)
  if (query.leadIds) {
    q = q.eq('subject_type', 'LEAD').in('subject_id', query.leadIds)
  } else if (query.repIds) {
    // Notes about in-scope reps, or written by them.
    const list = query.repIds.join(',')
    q = q.or(`and(subject_type.eq.REP,subject_id.in.(${list})),author_rep_id.in.(${list})`)
  }
  const { data, error } = await q
  if (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
  return (data ?? []) as NoteRow[]
}
