import type { DbClient } from '@/lib/db/types'
/**
 * Rep 360 (Phase 8.2–8.7) — header + overview assembly. Tabs load their own
 * data (leads / tasks / conversations / activity / performance) so the page
 * never preloads every dataset.
 */
import type { AuthContext } from '@/lib/auth/organization'
import type { PeopleRow } from '@/lib/operations/people'
import type { ConversationRow } from '@/lib/operations/conversations'
import type { UnifiedTask } from '@/lib/tasks/types'
import { isOverdue } from '@/lib/tasks/rank-unified-tasks'

export interface RepIdentity {
  id: string
  name: string
  title: string | null
  channel: string | null
  profileId: string | null
}

export interface RepBasics {
  id: string
  name: string
  repRole: string | null
  teams: Array<{ id: string; name: string }>
  identities: RepIdentity[]
}

export async function loadRepBasics(
  client: DbClient,
  auth: AuthContext,
  repId: string,
): Promise<RepBasics | null> {
  const [repRes, membershipRes, assignmentRes] = await Promise.all([
    client.from('reps').select('id, name, role').eq('organization_id', auth.orgId).eq('id', repId).maybeSingle(),
    client
      .from('team_memberships')
      .select('team_id')
      .eq('person_id', repId)
      .eq('active', true),
    client
      .from('identity_assignments')
      .select('revenue_identity_id')
      .eq('organization_id', auth.orgId)
      .eq('rep_id', repId),
  ])
  const rep = repRes.data as { id: string; name: string; role: string | null } | null
  if (!rep) return null

  // The joined tables are second reads rather than PostgREST embeds
  // (`teams!inner`, `identity:revenue_identities`), which the Neon adapter
  // cannot translate. Both are batched by id.
  const teamIds = (membershipRes.data ?? []).map((m: { team_id: string }) => m.team_id)
  const teams: { id: string; name: string }[] = []
  if (teamIds.length > 0) {
    const { data: teamRows } = await client
      .from('teams')
      .select('id, name, organization_id')
      .in('id', teamIds)
    teams.push(
      ...(teamRows ?? [])
        .filter((t: { id: string; name: string; organization_id: string }) => t.organization_id === auth.orgId)
        .map((t: { id: string; name: string; organization_id: string }) => ({ id: t.id, name: t.name })),
    )
  }

  const identityIds = (assignmentRes.data ?? []).map((a: { revenue_identity_id: string }) => a.revenue_identity_id)
  const identities: { id: string; name: string; title: string | null; channel: string | null; profileId: string | null }[] = []
  if (identityIds.length > 0) {
    const { data: identityRows } = await client
      .from('revenue_identities')
      .select('id, identity_name, title, channel, profile_id')
      .in('id', identityIds)
    identities.push(
      ...(identityRows ?? []).map((i: { id: string; identity_name: string; title: string | null; channel: string | null; profile_id: string | null }) => ({
        id: i.id,
        name: i.identity_name,
        title: i.title,
        channel: i.channel,
        profileId: i.profile_id,
      })),
    )
  }

  return { id: rep.id, name: rep.name, repRole: rep.role, teams, identities }
}

export interface RepAttentionItem {
  label: string
  detail: string
  href: string | null
  tone: 'default' | 'attention' | 'critical'
}

/** Pure: the Overview "Attention" block from canonical inputs. Never invents ages. */
export function buildRepAttention(input: {
  repId: string
  row: PeopleRow | null
  conversations: ConversationRow[]
  tasks: UnifiedTask[]
  now: number
}): RepAttentionItem[] {
  const { repId, row, conversations, tasks, now } = input
  const items: RepAttentionItem[] = []

  const oldestReply = conversations
    .filter((c) => c.state === 'waiting_on_rep' && c.ageHours !== null)
    .sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0))[0]
  items.push(
    oldestReply
      ? {
          label: 'Oldest reply waiting',
          detail: `${oldestReply.person}${oldestReply.company ? ` · ${oldestReply.company}` : ''} — ${oldestReply.ageHours}h`,
          href: oldestReply.href,
          tone: (oldestReply.ageHours ?? 0) >= 12 ? 'critical' : (oldestReply.ageHours ?? 0) >= 4 ? 'attention' : 'default',
        }
      : { label: 'Oldest reply waiting', detail: 'No replies waiting', href: null, tone: 'default' },
  )

  const oldestTask = tasks
    .filter((t) => isOverdue(t, now) && t.dueAt)
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))[0]
  items.push(
    oldestTask
      ? {
          label: 'Oldest overdue task',
          detail: `${oldestTask.title} — due ${Math.max(1, Math.round((now - Date.parse(oldestTask.dueAt!)) / 3_600_000))}h ago`,
          href: `/team/${repId}?tab=work&view=overdue&task=${encodeURIComponent(oldestTask.id)}`,
          tone: 'critical',
        }
      : { label: 'Oldest overdue task', detail: 'Nothing overdue', href: null, tone: 'default' },
  )

  const untouched = row?.highPriority ?? 0
  items.push({
    label: 'Untouched opportunities',
    detail: untouched > 0 ? `${untouched} high-priority lead${untouched === 1 ? '' : 's'} not yet worked` : 'None',
    href: untouched > 0 ? `/team/${repId}?tab=leads&priority=high` : null,
    tone: untouched >= 3 ? 'attention' : 'default',
  })

  const dayState = row?.dayState ?? null
  const atRisk = dayState === 'AT_RISK' || dayState === 'CRITICAL' || dayState === 'MISSED'
  items.push({
    label: 'Target risk',
    detail: row
      ? atRisk
        ? `${Math.round(row.targetPct)}% of today's target · day ${dayState.toLowerCase().replace('_', ' ')}`
        : `${Math.round(row.targetPct)}% of today's target`
      : 'No target data',
    href: `/admin/command/${repId}`,
    tone: dayState === 'CRITICAL' || dayState === 'MISSED' ? 'critical' : atRisk ? 'attention' : 'default',
  })

  return items
}
