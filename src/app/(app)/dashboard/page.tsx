import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue } from '@/lib/relay/queue-engine'
import { loadAccountabilityDashboard } from '@/lib/relay/dashboard-loader'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { RepWorkspace, type RepWorkspaceData } from '@/components/rep/rep-workspace'
import { type CommandCenterData } from '@/components/admin/admin-command-center'
import { LiveCommandCenter } from '@/components/admin/live-command-center'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  // Load accountability data (all roles)
  const acData = await loadAccountabilityDashboard()

  if (authCtx.isOwner || authCtx.isAdmin) {
    return (
      <Suspense fallback={<DashboardShellSkeleton />}>
        <AdminTodayViewWithAccountability acData={acData} />
      </Suspense>
    )
  }

  // Check if manager (has managed teams)
  if (authCtx.isManager && authCtx.managedTeamIds.length > 0) {
    const [repData, teamData] = await Promise.all([
      loadRepWorkspaceData(user.rep.id),
      loadManagerTeamTab(),
    ])

    return (
      <Suspense fallback={<DashboardShellSkeleton />}>
        <ManagerTodayView
          repData={repData}
          teamData={teamData}
        />
      </Suspense>
    )
  }

  // Rep view
  const [repData, teamData] = await Promise.all([
    loadRepWorkspaceData(user.rep.id),
    loadManagerTeamTab(),
  ])

  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <RepTodayViewWithAccountability
        repData={repData}
        teamData={teamData}
      />
    </Suspense>
  )
}

// ── Rep View with My Day ─────────────────────────────────────────────────────

function RepTodayViewWithAccountability({
  repData,
  teamData,
}: {
  repData: RepWorkspaceData
  teamData: { teams: any[]; isOwner: boolean }
}) {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1.5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Your Relay</p>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink">YOUR DAY</h1>
        <p className="text-[13px] text-graphite">Do This Next · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>

      <RepWorkspace data={repData} teamData={teamData} />
    </div>
  )
}

// ── Manager View ─────────────────────────────────────────────────────────────

function ManagerTodayView({
  repData,
  teamData,
}: {
  repData: RepWorkspaceData
  teamData: { teams: any[]; isOwner: boolean }
}) {
  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1.5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Command Center</p>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink">Team overview</h1>
        <p className="text-[13px] text-graphite">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>

      <RepWorkspace data={repData} teamData={teamData} mode="manager" />
    </div>
  )
}

// ── Admin View with Command Center ───────────────────────────────────────────

function AdminTodayViewWithAccountability({
  acData,
}: {
  acData: Awaited<ReturnType<typeof loadAccountabilityDashboard>>
}) {
  const ccData: CommandCenterData = acData?.commandCenter ? {
    date: acData.date,
    teamHealth: acData.commandCenter.teamHealth,
    attentionItems: acData.commandCenter.attentionItems,
    team: acData.commandCenter.team,
  } : {
    date: new Date().toISOString().slice(0, 10),
    teamHealth: { working: 0, onTrack: 0, atRisk: 0, behind: 0, blocked: 0, closed: 0 },
    attentionItems: [],
    team: [],
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1.5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Command Center</p>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink">
          {ccData && ccData.attentionItems.length > 0
            ? `${ccData.attentionItems.length} item${ccData.attentionItems.length === 1 ? '' : 's'} need attention`
            : 'Team overview'}
        </h1>
        <p className="text-[13px] text-graphite">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>

      {ccData.team.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-line bg-bone-raised">
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone">Who covered their day</p>
            <p className="mt-1 text-[14px] text-graphite">Green means every number is done. Everyone else still has work.</p>
          </div>
          <ul className="divide-y divide-line/70 border-t border-line">
            {[...ccData.team].sort((a, b) => b.remaining - a.remaining).map((person) => {
              const won = person.remaining === 0 && person.status === 'completed'
              return (
                <li key={person.personId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-ink">{person.personName}</span>
                    <span className="text-[12px] text-graphite">{person.workingAs.join(', ') || 'No profile'}</span>
                  </span>
                  <span className={won ? 'text-[13px] font-medium text-status-success' : 'text-[13px] text-ink'}>
                    {won ? 'Day won' : `${person.remaining} left`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-line bg-bone-raised" />}>
        <LiveCommandCenter />
      </Suspense>

      <Link href="/admin/command-center" className="inline-flex items-center gap-1 text-[12px] font-medium text-ink">
        Open full command center →
      </Link>
    </div>
  )
}

async function loadManagerTeamTab() {
  try {
    const authCtx = await getAuthContext()
    if (!authCtx || authCtx.managedTeamIds.length === 0) return { teams: [], isOwner: false }
    const store = await createScoutStore()
    const today = new Date().toISOString().slice(0, 10)
    const teams = await Promise.all(authCtx.managedTeamIds.map(async (teamId) => {
      const [teamInfo, members, targets] = await Promise.all([
        store.getTeamInfo(teamId),
        store.getTeamMembers(teamId),
        store.getTeamTargets(teamId, today),
      ])
      const memberDetails = members.map((member) => {
        const memberTargets = targets.filter((target) => target.repId === member.repId)
        const totalTarget = memberTargets.reduce((sum, target) => sum + target.targetCount, 0)
        const totalCompleted = memberTargets.reduce((sum, target) => sum + target.completedCount, 0)
        return {
          repId: member.repId,
          repName: member.repName,
          role: member.role,
          revenueIdentities: memberTargets.map((target) => ({
            identityName: target.identityName,
            channel: target.channel,
            targets: [{
              activityType: target.activityType,
              targetCount: target.targetCount,
              completedCount: target.completedCount,
              remaining: target.remaining,
              status: target.status,
            }],
          })),
          totalTarget,
          totalCompleted,
          totalRemaining: Math.max(0, totalTarget - totalCompleted),
          attentionReason: memberTargets.some((target) => target.status === 'at_risk' || target.status === 'missed')
            ? `${Math.max(0, totalTarget - totalCompleted)} remaining`
            : null,
        }
      })
      return {
        teamId,
        teamName: teamInfo?.name ?? 'My Team',
        memberCount: members.length,
        totalTarget: memberDetails.reduce((sum, member) => sum + member.totalTarget, 0),
        totalCompleted: memberDetails.reduce((sum, member) => sum + member.totalCompleted, 0),
        totalRemaining: memberDetails.reduce((sum, member) => sum + member.totalRemaining, 0),
        needsAttention: memberDetails.filter((member) => member.attentionReason).length,
        members: memberDetails,
      }
    }))
    return { teams, isOwner: false }
  } catch {
    return { teams: [], isOwner: false }
  }
}

async function loadRepWorkspaceData(repId: string): Promise<RepWorkspaceData> {
  const user = await getCurrentUser()
  if (!user || user.rep.id !== repId) {
    throw new Error('Not signed in')
  }

  const store = await createScoutStore()

  const { getDailyWorkspace } = await import('@/lib/auth/workspace')
  const workspace = await getDailyWorkspace()

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

  const profilesPulled = await countProfilesPulled(user.organization.id, user.rep.id)

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
    profilesPulled,
  }
}

async function countProfilesPulled(orgId: string, repId: string): Promise<number> {
  try {
    const supabase = await createServerSupabase()
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const { count } = await supabase
      .from('extraction_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('rep_id', repId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
    return count ?? 0
  } catch {
    return 0
  }
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
