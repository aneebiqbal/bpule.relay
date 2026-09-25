import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue } from '@/lib/relay/queue-engine'
import { loadAccountabilityDashboard } from '@/lib/relay/dashboard-loader'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { RepWorkspace, type RepWorkspaceData } from '@/components/rep/rep-workspace'
import { MyDayCard, type MyDayData } from '@/components/rep/my-day-card'
import { type CommandCenterData } from '@/components/admin/admin-command-center'
import { LiveCommandCenter } from '@/components/admin/live-command-center'
import { ManagerTeamView, type ManagerTeamData } from '@/components/manager/manager-team-view'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  // Load accountability data (all roles)
  const acData = await loadAccountabilityDashboard()

  if (authCtx.isOwner || authCtx.isAdmin) {
    // Admin / Owner view
    const personal = await loadRepWorkspaceData(user.rep.id).catch(() => null)

    return (
      <Suspense fallback={<DashboardShellSkeleton />}>
        <AdminTodayViewWithAccountability
          acData={acData}
          personal={personal}
        />
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
          acData={acData}
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
        acData={acData}
        repData={repData}
        teamData={teamData}
      />
    </Suspense>
  )
}

// ── Rep View with My Day ─────────────────────────────────────────────────────

function RepTodayViewWithAccountability({
  acData,
  repData,
  teamData,
}: {
  acData: Awaited<ReturnType<typeof loadAccountabilityDashboard>>
  repData: RepWorkspaceData
  teamData: { teams: any[]; isOwner: boolean }
}) {
  const myDayData: MyDayData | null = acData?.myDay ? {
    status: acData.myDay.status as MyDayData['status'],
    timeRemaining: acData.myDay.timeRemaining,
    dayElapsedPct: acData.myDay.dayElapsedPct,
    totalCompleted: acData.myDay.totalCompleted,
    totalTarget: acData.myDay.totalTarget,
    totalRemaining: acData.myDay.totalRemaining,
    categories: acData.myDay.categories.map((c) => ({
      key: c.key,
      label: c.label,
      completed: c.completed,
      target: c.target,
      remaining: Math.max(0, c.target - c.completed),
      href: c.href,
    })),
    warning: acData.myDay.warning ? {
      level: acData.myDay.warning.level,
      message: acData.myDay.warning.message,
      categories: acData.myDay.warning.categories,
    } : null,
    canCloseDay: acData.myDay.canCloseDay,
    dayCloseStatus: acData.myDay.dayCloseStatus,
    hasContract: acData.myDay.hasContract,
    identityId: repData.identities[0]?.revenueIdentityId ?? undefined,
  } : null

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
  acData,
  repData,
  teamData,
}: {
  acData: Awaited<ReturnType<typeof loadAccountabilityDashboard>>
  repData: RepWorkspaceData
  teamData: { teams: any[]; isOwner: boolean }
}) {
  const myDayData: MyDayData | null = acData?.myDay ? {
    status: acData.myDay.status as MyDayData['status'],
    timeRemaining: acData.myDay.timeRemaining,
    dayElapsedPct: acData.myDay.dayElapsedPct,
    totalCompleted: acData.myDay.totalCompleted,
    totalTarget: acData.myDay.totalTarget,
    totalRemaining: acData.myDay.totalRemaining,
    categories: acData.myDay.categories.map((c) => ({
      key: c.key,
      label: c.label,
      completed: c.completed,
      target: c.target,
      remaining: Math.max(0, c.target - c.completed),
      href: c.href,
    })),
    warning: acData.myDay.warning ? {
      level: acData.myDay.warning.level,
      message: acData.myDay.warning.message,
      categories: acData.myDay.warning.categories,
    } : null,
    canCloseDay: acData.myDay.canCloseDay,
    dayCloseStatus: acData.myDay.dayCloseStatus,
    hasContract: acData.myDay.hasContract,
    identityId: repData.identities[0]?.revenueIdentityId ?? undefined,
  } : null

  const managerTeamData: ManagerTeamData = acData?.team ? {
    date: acData.date,
    teams: acData.team.teams.map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      members: t.members,
    })),
  } : {
    date: new Date().toISOString().slice(0, 10),
    teams: [],
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-1.5">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">Command Center</p>
        <h1 className="text-display text-[28px] font-light tracking-[-0.02em] text-ink">Team overview</h1>
        <p className="text-[13px] text-graphite">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </header>

      <RepWorkspace data={repData} teamData={teamData} mode="manager" />

      {myDayData && (
        <section className="space-y-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">My Work</p>
          <MyDayCard data={myDayData} />
        </section>
      )}
    </div>
  )
}

// ── Admin View with Command Center ───────────────────────────────────────────

function AdminTodayViewWithAccountability({
  acData,
  personal,
}: {
  acData: Awaited<ReturnType<typeof loadAccountabilityDashboard>>
  personal: RepWorkspaceData | null
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

  const myDayData: MyDayData | null = acData?.myDay && acData.myDay.hasIdentity ? {
    status: acData.myDay.status as MyDayData['status'],
    timeRemaining: acData.myDay.timeRemaining,
    dayElapsedPct: acData.myDay.dayElapsedPct,
    totalCompleted: acData.myDay.totalCompleted,
    totalTarget: acData.myDay.totalTarget,
    totalRemaining: acData.myDay.totalRemaining,
    categories: acData.myDay.categories.map((c) => ({
      key: c.key,
      label: c.label,
      completed: c.completed,
      target: c.target,
      remaining: Math.max(0, c.target - c.completed),
      href: c.href,
    })),
    warning: acData.myDay.warning ? {
      level: acData.myDay.warning.level,
      message: acData.myDay.warning.message,
      categories: acData.myDay.warning.categories,
    } : null,
    canCloseDay: acData.myDay.canCloseDay,
    dayCloseStatus: acData.myDay.dayCloseStatus,
    hasContract: acData.myDay.hasContract,
  } : null

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

      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-line bg-bone-raised" />}>
        <LiveCommandCenter />
      </Suspense>

      {myDayData && (
        <section className="space-y-3">
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-stone">My Work</p>
          <MyDayCard data={myDayData} />
        </section>
      )}

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
