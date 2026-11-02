import type { DbClient } from '@/lib/db/types'
/**
 * Grouped global search for Cmd-K (Phase 8.30): People, Companies, Leads,
 * Tasks, Conversations. Every read is scoped (operational scope), narrow and
 * capped; a search term never widens what the viewer could open directly.
 */
import type { AuthContext } from '@/lib/auth/organization'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { leadLabel } from '@/lib/operations/labels'
import type { OperationalScope } from '@/lib/operations/scope'

import type { SearchGroupKey, SearchGroups, SearchHit } from '@/lib/operations/search-shared'
export { SEARCH_GROUP_LABEL } from '@/lib/operations/search-shared'
export type { SearchGroupKey, SearchGroups, SearchHit }

const PER_GROUP = 5

/** Strip PostgREST filter syntax and wildcards from user input. */
export function sanitizeSearchTerm(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/[%,()\\*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export interface SearchInput {
  people: Array<{ id: string; name: string }>
  leads: Array<{
    id: string
    contact_name: string | null
    company: string | null
    company_key: string | null
    contact_title: string | null
  }>
  /** Lead ids that have a live conversation (sent or received). */
  conversationLeadIds: Set<string>
  tasks: Array<{ id: string; title: string; status: string; assigneeName: string | null }>
  /** People links go to Rep 360 only for managers/admins. */
  canOpenRep: boolean
  term: string
}

/** Pure: shape raw rows into ranked, de-duplicated groups. */
export function buildSearchGroups(input: SearchInput): SearchGroups {
  const t = input.term.toLowerCase()
  const startsFirst = <T>(rows: T[], text: (r: T) => string) =>
    [...rows].sort((a, b) => Number(!text(a).toLowerCase().startsWith(t)) - Number(!text(b).toLowerCase().startsWith(t)))

  const companies = new Map<string, SearchHit>()
  for (const lead of startsFirst(input.leads, (l) => l.company ?? '')) {
    if (!lead.company_key || !lead.company?.toLowerCase().includes(t)) continue
    if (companies.has(lead.company_key)) continue
    companies.set(lead.company_key, {
      id: lead.company_key,
      label: lead.company,
      detail: null,
      href: `/accounts/${encodeURIComponent(lead.company_key)}`,
    })
  }

  return {
    people: startsFirst(input.people, (p) => p.name)
      .slice(0, PER_GROUP)
      .map((p) => ({ id: p.id, label: p.name, detail: null, href: input.canOpenRep ? `/team/${p.id}` : '/performance' })),
    companies: [...companies.values()].slice(0, PER_GROUP),
    leads: startsFirst(input.leads, (l) => l.contact_name ?? l.company ?? '')
      .slice(0, PER_GROUP)
      .map((l) => ({ id: l.id, label: leadLabel(l.contact_name, l.company), detail: l.contact_title, href: `/leads/${l.id}` })),
    tasks: startsFirst(input.tasks, (x) => x.title)
      .slice(0, PER_GROUP)
      .map((x) => ({
        id: x.id,
        label: x.title,
        detail: [x.assigneeName, x.status === 'IN_PROGRESS' ? 'In progress' : x.status === 'OPEN' ? 'Open' : null].filter(Boolean).join(' · ') || null,
        // Deep link contract: a task result opens that task (/tasks?task=…).
        href: `/tasks?task=assigned:${x.id}`,
      })),
    conversations: input.leads
      .filter((l) => input.conversationLeadIds.has(l.id))
      .slice(0, PER_GROUP)
      .map((l) => ({ id: `c:${l.id}`, label: leadLabel(l.contact_name, l.company), detail: 'Conversation', href: `/chats?lead=${l.id}` })),
  }
}

export function emptySearchGroups(): SearchGroups {
  return { people: [], companies: [], leads: [], tasks: [], conversations: [] }
}

export async function searchOperational(
  client: DbClient,
  auth: AuthContext,
  scope: OperationalScope,
  raw: string,
): Promise<SearchGroups> {
  const term = sanitizeSearchTerm(raw)
  if (term.length < 2) return emptySearchGroups()
  const like = `%${term}%`

  let peopleQ = client.from('reps').select('id, name').eq('organization_id', auth.orgId).ilike('name', like).limit(10)
  if (scope.repIds) peopleQ = peopleQ.in('id', scope.repIds)

  let leadsQ = client
    .from('leads')
    .select('id, contact_name, company, company_key, contact_title')
    .eq('organization_id', auth.orgId)
    .eq('archived', false)
    .or(`contact_name.ilike.${like},company.ilike.${like}`)
    .order('created_at', { ascending: false })
    .limit(25)
  if (scope.repIds) leadsQ = leadsQ.in('owner_rep_id', scope.repIds)

  let tasksQ = client
    .from('assigned_tasks')
    .select('id, title, status, assignee_rep_id')
    .eq('organization_id', auth.orgId)
    .in('status', ['OPEN', 'IN_PROGRESS'])
    .ilike('title', like)
    .order('created_at', { ascending: false })
    .limit(10)
  if (scope.repIds) tasksQ = tasksQ.in('assignee_rep_id', scope.repIds)

  const [peopleRes, leadsRes, tasksRes] = await Promise.all([peopleQ, leadsQ, tasksQ])
  if (leadsRes.error) throw leadsRes.error
  const leads = (leadsRes.data ?? []) as SearchInput['leads']
  const taskRows = tasksRes.error && isMissingRelation(tasksRes.error)
    ? []
    : ((tasksRes.data ?? []) as Array<{ id: string; title: string; status: string; assignee_rep_id: string }>)

  const assigneeIds = [...new Set(taskRows.map((x) => x.assignee_rep_id))]
  const [statesRes, assigneesRes] = await Promise.all([
    leads.length
      ? client
          .from('conversation_states')
          .select('lead_id, last_sent_at, last_reply_at')
          .eq('organization_id', auth.orgId)
          .in('lead_id', leads.map((l) => l.id))
      : Promise.resolve({ data: [] }),
    assigneeIds.length
      ? client.from('reps').select('id, name').eq('organization_id', auth.orgId).in('id', assigneeIds)
      : Promise.resolve({ data: [] }),
  ])
  const conversationLeadIds = new Set(
    ((statesRes.data ?? []) as Array<{ lead_id: string; last_sent_at: string | null; last_reply_at: string | null }>)
      .filter((s) => s.last_reply_at || s.last_sent_at)
      .map((s) => s.lead_id),
  )
  const names = new Map(((assigneesRes.data ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]))

  return buildSearchGroups({
    people: (peopleRes.data ?? []) as Array<{ id: string; name: string }>,
    leads,
    conversationLeadIds,
    tasks: taskRows.map((x) => ({ id: x.id, title: x.title, status: x.status, assigneeName: names.get(x.assignee_rep_id) ?? null })),
    canOpenRep: scope.mode !== 'own',
    term,
  })
}
