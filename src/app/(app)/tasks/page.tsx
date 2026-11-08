import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue, filterQueueByRole } from '@/lib/relay/queue-engine'
import { rankNextActions, type NextBestAction } from '@/lib/relay/next-best-action'
import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import type { RelayTaskKind } from '@/lib/domain/types'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'
import {
  filterActionsByWorkspace,
  filterLeadsByWorkspace,
} from '@/lib/rep-home/profile-scope'
import { actionDeepLink } from '@/lib/rep-home/action-presentation'
import { loadUnifiedTasks, listAssignableReps, canActorAssignTasks } from '@/lib/tasks/load-unified-tasks'
import { TaskWorkspaceView } from '@/components/tasks/task-workspace-view'
import { getPeopleDirectory } from '@/lib/operations/page-context'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const auth = await getAuthContext()
  if (!auth) redirect('/login')

  const showAssignee = auth.isManager || auth.isAdmin || auth.isOwner
  const canAssign = await canActorAssignTasks(auth)
  const [derivedActions, reps, directory, composerOptions, transferTargets] = await Promise.all([
    loadDerivedActionsForCurrentUser(),
    listAssignableReps(auth),
    showAssignee ? getPeopleDirectory().catch(() => null) : Promise.resolve(null),
    canAssign ? loadComposerOptions(auth.orgId).catch(() => null) : Promise.resolve(null),
    // Handoff requests need the org list even when the viewer cannot assign.
    loadTransferTargets(auth.orgId),
  ])

  const tasks = await loadUnifiedTasks({
    auth,
    derivedActions,
    // Managers/admins see team/org assigned; derived is personal queue only.
    forRepId: auth.isAdmin || auth.isOwner || auth.isManager ? undefined : auth.repId,
    includeCompleted: true,
  })

  return (
    <Suspense fallback={<div className="py-10 text-[13px] text-graphite">Loading tasks…</div>}>
      <TaskWorkspaceView
        tasks={tasks}
        canAssign={canAssign}
        showAssignee={showAssignee}
        reps={reps}
        currentRepId={auth.repId}
        now={Date.now()}
        timeZone={user.organization.timezone ?? 'UTC'}
        teams={(directory?.teams ?? []).map((t) => ({ id: t.id, name: t.name, memberIds: t.memberIds }))}
        leads={composerOptions?.leads ?? []}
        profiles={composerOptions?.profiles ?? []}
        transferTargets={transferTargets}
      />
    </Suspense>
  )
}

/**
 * Composer options: searchable leads + canonical profiles. Bounded reads, only
 * for users who can actually assign.
 */
async function loadComposerOptions(orgId: string): Promise<{
  leads: Array<{ id: string; company: string | null }>
  profiles: Array<{ id: string; name: string }>
}> {
  const store = await createScoutStore()
  const client = store.getSupabaseClient()
  const [leadsRes, profilesRes] = await Promise.all([
    client.from('leads').select('id, company').eq('organization_id', orgId).limit(500),
    client
      .from('profiles')
      .select('id, display_name, full_name, label')
      .eq('organization_id', orgId)
      .limit(500),
  ])
  return {
    leads: ((leadsRes.data ?? []) as Array<{ id: string; company: string | null }>)
      .sort((a, b) => (a.company ?? '').localeCompare(b.company ?? '')),
    profiles: ((profilesRes.data ?? []) as Array<{
      id: string
      display_name: string | null
      full_name: string | null
      label: string | null
    }>)
      .map((profile) => ({
        id: profile.id,
        name: profile.display_name ?? profile.full_name ?? profile.label ?? 'Unnamed',
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** Org reps a handoff may be requested to. Bounded, names only. */
async function loadTransferTargets(orgId: string): Promise<Array<{ id: string; name: string }>> {
  const store = await createScoutStore()
  const { data } = await store
    .getSupabaseClient()
    .from('reps')
    .select('id, name')
    .eq('organization_id', orgId)
    .order('name')
    .limit(200)
  return ((data ?? []) as Array<{ id: string; name: string }>).map((rep) => ({ id: rep.id, name: rep.name }))
}

/** Same ranking path as dashboard — derived tasks stay projections of queue state. */
async function loadDerivedActionsForCurrentUser(): Promise<RelayTodayAction[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const store = await createScoutStore()
  store.beginReadOnlySnapshot()
  const { getDailyWorkspace } = await import('@/lib/auth/workspace')
  const [workspace, activeWorkspace, dash, relayData] = await Promise.all([
    getDailyWorkspace(),
    resolveActiveWorkspace(),
    store.getTodayDashboard(),
    store.getRelayQueueData(),
  ])

  const scopedLeads = filterLeadsByWorkspace(dash.mine?.queue ?? [], activeWorkspace)
  const scopedFollowups = dash.followupsDue.filter((row) =>
    filterLeadsByWorkspace([row.lead], activeWorkspace).length > 0,
  )
  const leadsById = new Map(scopedLeads.map((lead) => [lead.id, lead]))

  const roleContext = buildRoleContext(user.rep, user.organization)
  const queue = buildRelayQueue({
    roleContext,
    queueData: dash.mine ? { ...dash.mine, queue: scopedLeads } : dash.mine,
    followupsDue: scopedFollowups,
    upwork: dash.upwork,
    conversations: relayData.conversations,
    messagesByLead: relayData.messagesByLead,
    messagesByJob: relayData.messagesByJob,
    assignedProfiles: relayData.assignedProfiles,
    allReps: undefined,
    allLeads: [],
    suppressedLeadIds: await store.getSuppressedLeadIds(),
  })

  const visibleTasks = filterQueueByRole(queue, roleContext.role)
  const filteredQueue = {
    ...queue,
    tasks: visibleTasks,
    summary: {
      total: visibleTasks.length,
      urgent: visibleTasks.filter((t) => t.priority === 'urgent').length,
      byKind: queue.summary.byKind,
    },
  }

  const rankedActions = rankNextActions({
    queue: filteredQueue,
    leads: scopedLeads,
    messagesByLead: relayData.messagesByLead,
  })

  const map = nbaToRelayAction(nbaToActionKind, workspace, activeWorkspace)
  const raw = rankedActions.map(map)

  return filterActionsByWorkspace(raw, leadsById, activeWorkspace).map((action) => ({
    ...action,
    href: actionDeepLink(action),
  }))
}

function nbaToActionKind(action: NextBestAction['action']): RelayTaskKind {
  switch (action) {
    case 'REPLY_NOW':
      return 'reply_needed'
    case 'SEND_CONNECTION':
    case 'SEND_FIRST_DM':
      return 'connection_dm_due'
    case 'SEND_FOLLOWUP':
      return 'followup_due'
    case 'RESEARCH':
      return 'high_fit_lead'
    case 'REVIEW_REFERRAL':
      return 'admin_review'
    case 'APPLY_UPWORK':
      return 'job_worth_apply'
    case 'RESUME_DRAFT':
      return 'proposal_ready'
    case 'WAIT':
      return 'lead_going_cold'
    default:
      return 'new_opportunity'
  }
}

function nbaToRelayAction(
  toKind: typeof nbaToActionKind,
  workspace: { identities: Array<{ identityName: string; title: string | null; channel: string | null }> },
  activeWorkspace: { id: string; identityName: string; title: string | null; channel: string } | null,
) {
  return (nba: NextBestAction): RelayTodayAction => ({
    id: nba.leadId ?? nba.jobId ?? 'unknown',
    kind: toKind(nba.action),
    priority:
      nba.priority >= 80
        ? ('urgent' as const)
        : nba.priority >= 60
          ? ('high' as const)
          : nba.priority >= 40
            ? ('medium' as const)
            : ('low' as const),
    title: nba.title,
    subtitle: nba.subtitle,
    href: nba.leadId ? `/leads/${nba.leadId}` : nba.jobId ? `/upwork/${nba.jobId}` : '/dashboard',
    whatHappened: nba.reason,
    whyItMatters: nba.reason,
    whyLines: [nba.reason],
    prepared: null,
    humanAction: nba.action,
    createdAt: nba.dueAt ?? new Date().toISOString(),
    fitScore: null,
    identity: {
      id: activeWorkspace?.id ?? null,
      name: activeWorkspace?.identityName ?? workspace.identities[0]?.identityName ?? '',
      title: activeWorkspace?.title ?? workspace.identities[0]?.title ?? null,
      channel: activeWorkspace?.channel ?? workspace.identities[0]?.channel ?? null,
    },
    proof: null,
    inbound: nba.channel === 'INBOUND',
  })
}
