import { Suspense, use } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { loadOrgCommandSnapshot } from '@/lib/admin/org-command-snapshot'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue } from '@/lib/relay/queue-engine'
import { cn } from 'cn'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { RepWorkspace, type RepWorkspaceData } from '@/components/rep/rep-workspace'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  if (authCtx.isOwner || authCtx.isAdmin) {
    const snapshot = await loadOrgCommandSnapshot()
    const teamRows = snapshot.people.map((person) => ({
      id: person.repId,
      name: person.repName,
      completed: person.totalCompleted,
      target: person.totalTarget,
      remaining: person.totalRemaining,
      status: person.status,
      profiles: person.profiles,
      leads: person.leads,
      extractions: person.extractions,
    }))
    const attentionItems = snapshot.attention.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      severity: item.severity,
    }))
    const adminSummary = {
      teamRows,
      attentionItems,
      activeConversations: 0,
      highIntent: 0,
      onTrackCount: teamRows.filter((row) => row.status === 'on_track' || row.status === 'completed').length,
      totalReps: teamRows.length,
      totals: snapshot.totals,
    }

    return (
      <AdminTodayView
        adminSummary={adminSummary}
        generatedAt={new Date().toISOString()}
      />
    )
  }

  // Managers and Members see personal responsibility workspace
  // Managers also get a Team tab
  const repDataPromise = loadRepWorkspaceData()
  const teamDataPromise = fetch('/api/me/team').then((r) => r.ok ? r.json() : { teams: [] }).catch(() => ({ teams: [] }))
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <RepWorkspaceAsync dataPromise={repDataPromise} teamDataPromise={teamDataPromise} />
    </Suspense>
  )
}

async function loadRepWorkspaceData(): Promise<RepWorkspaceData> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()

  // Get daily workspace from canonical auth helper
  const { getDailyWorkspace } = await import('@/lib/auth/workspace')
  const workspace = await getDailyWorkspace()

  // Get relay queue for next action + up next
  const [dash, relayData] = await Promise.all([
    store.getTodayDashboard(),
    store.getRelayQueueData(),
  ])

  const roleContext = buildRoleContext(user.rep, user.organization)
  const queue = buildRelayQueue({
    roleContext,
    queueData: dash.mine,
    followupsDue: dash.followupsDue,
    upwork: dash.upwork,
    conversations: relayData.conversations,
    messagesByLead: relayData.messagesByLead,
    messagesByJob: relayData.messagesByJob,
    assignedProfiles: relayData.assignedProfiles,
    allReps: undefined,
    allLeads: [],
  })

  const { filterQueueByRole } = await import('@/lib/relay/queue-engine')
  const visibleTasks = filterQueueByRole(queue, roleContext.role)

  const actions: RelayTodayAction[] = visibleTasks.slice(0, 10).map((task) => ({
    id: task.id,
    kind: task.kind,
    priority: task.priority,
    title: task.title.replace(/^New inbound\s*[-:]\s*/i, '').trim(),
    subtitle: task.subtitle,
    href: task.entityType === 'lead' ? `/leads/${task.entityId}` : task.entityType === 'job' ? `/upwork/${task.entityId}` : '/dashboard',
    whatHappened: task.whatHappened,
    whyItMatters: task.whyItMatters,
    whyLines: [task.whatHappened, task.whyItMatters],
    prepared: task.recommendation.preparedOutput ?? task.recommendation.action,
    humanAction: task.humanAction,
    createdAt: task.createdAt,
    fitScore: null,
    identity: task.entityType === 'lead' ? {
      id: null,
      name: workspace.identities[0]?.identityName ?? '',
      title: workspace.identities[0]?.title ?? null,
      channel: workspace.identities[0]?.channel ?? null,
    } : null,
    proof: null,
    inbound: task.kind === 'inbound_opportunity',
  }))

  return {
    rep: workspace.rep,
    isWorkingDay: workspace.isWorkingDay,
    hasAssignments: workspace.hasAssignments,
    identities: workspace.targetSummary.byIdentity,
    targetSummary: workspace.targetSummary,
    day: workspace.day,
    nextAction: actions[0] ?? null,
    upNext: actions.slice(1),
    notifications: [],
  }
}

function RepWorkspaceAsync({ dataPromise, teamDataPromise }: { dataPromise: Promise<RepWorkspaceData>; teamDataPromise?: Promise<any> }) {
  const data = use(dataPromise)
  const teamData = teamDataPromise ? use(teamDataPromise) : undefined
  return <RepWorkspace data={data} teamData={teamData} />
}

type AdminTodaySummary = {
  teamRows: Array<{
    id: string
    name: string
    completed: number
    target: number
    remaining: number
    status: string
    profiles: number
    leads: number
    extractions: number
  }>
  attentionItems: Array<{ id: string; title: string; detail: string; severity: 'warning' | 'critical' }>
  activeConversations: number
  highIntent: number
  onTrackCount: number
  totalReps: number
  totals: {
    people: number
    profiles: number
    leads: number
    extractions: number
    remaining: number
    peopleWithWork: number
  }
}

function AdminTodayView({ adminSummary, generatedAt }: { adminSummary: AdminTodaySummary; generatedAt: string }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Revenue Operations</p>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink">
          {adminSummary.attentionItems.length > 0
            ? `${adminSummary.attentionItems.length} item${adminSummary.attentionItems.length === 1 ? '' : 's'} need attention`
            : adminSummary.totals.peopleWithWork > 0
              ? 'Team work is visible'
              : 'Team is on track'}
        </h1>
        <p className="text-[13px] text-graphite">{new Date(generatedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded border border-line bg-bone-raised px-3 py-2">
          <p className="text-mono-medium text-[9px] uppercase tracking-wide text-stone">People</p>
          <p className="mt-0.5 text-[15px] font-medium text-ink">{adminSummary.totals.people}</p>
        </div>
        <div className="rounded border border-line bg-bone-raised px-3 py-2">
          <p className="text-mono-medium text-[9px] uppercase tracking-wide text-stone">Profiles</p>
          <p className="mt-0.5 text-[15px] font-medium text-ink">{adminSummary.totals.profiles}</p>
        </div>
        <div className="rounded border border-line bg-bone-raised px-3 py-2">
          <p className="text-mono-medium text-[9px] uppercase tracking-wide text-stone">Leads</p>
          <p className="mt-0.5 text-[15px] font-medium text-ink">{adminSummary.totals.leads}</p>
        </div>
        <div className="rounded border border-line bg-bone-raised px-3 py-2">
          <p className="text-mono-medium text-[9px] uppercase tracking-wide text-stone">Extractions</p>
          <p className="mt-0.5 text-[15px] font-medium text-ink">{adminSummary.totals.extractions}</p>
        </div>
      </div>

      {adminSummary.attentionItems.length > 0 && (
        <section className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-4">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-status-warning">Needs Attention</p>
          <div className="mt-3 space-y-2">
            {adminSummary.attentionItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13px] font-medium text-ink">{item.title}</p>
                  <p className="text-[12px] text-graphite">{item.detail}</p>
                </div>
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-mono-medium text-[10px] uppercase tracking-wide',
                  item.severity === 'critical' ? 'bg-status-danger/15 text-status-danger' : 'bg-status-warning/15 text-status-warning',
                )}>
                  {item.severity}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-line bg-bone-raised p-4">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Everyone</p>
        {adminSummary.teamRows.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded border border-line">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line bg-bone text-left text-mono-medium text-[10px] uppercase tracking-wide text-stone">
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Profiles</th>
                  <th className="px-3 py-2">Leads</th>
                  <th className="px-3 py-2">Extractions</th>
                  <th className="px-3 py-2">Today</th>
                </tr>
              </thead>
              <tbody>
                {adminSummary.teamRows.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-ink">
                      <Link href={`/team/${row.id}`} className="hover:underline">{row.name}</Link>
                    </td>
                    <td className="px-3 py-2 text-graphite">{row.profiles}</td>
                    <td className="px-3 py-2 text-graphite">{row.leads}</td>
                    <td className="px-3 py-2 text-graphite">{row.extractions}</td>
                    <td className="px-3 py-2 text-graphite">
                      {row.target > 0 ? `${row.completed}/${row.target}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-graphite">No people in this organization yet.</p>
        )}
      </section>

      <Link href="/admin/command-center" className="inline-flex items-center gap-1 text-[12px] font-medium text-ink">
        Open full command center →
      </Link>
    </div>
  )
}

function DashboardShellSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-2">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your Relay / Today</p>
        <div className="h-8 w-72 max-w-full rounded bg-bone" />
        <div className="h-3.5 w-64 max-w-full rounded bg-bone" />
      </header>
      <div className="srf-console srf-console-edge hero-console-pulse overflow-hidden p-5 sm:p-6">
        <div className="h-3 w-16 rounded bg-bone" />
        <div className="mt-4 h-7 w-80 max-w-full rounded bg-bone" />
        <div className="mt-2 h-3.5 w-64 max-w-full rounded bg-bone" />
        <div className="mt-4 h-24 w-full rounded bg-bone" />
      </div>
      <section className="space-y-3">
        <div className="h-3 w-24 rounded bg-bone" />
        <div className="overflow-hidden rounded border border-line bg-bone-raised">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line/70 px-3 py-3 last:border-b-0">
              <span className="w-7 text-mono-medium text-[11px] text-stone/75">{String(i + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-40 max-w-full rounded bg-bone" />
                <div className="h-3 w-56 max-w-full rounded bg-bone" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}



