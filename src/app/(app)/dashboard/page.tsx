import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue, filterQueueByRole } from '@/lib/relay/queue-engine'
import type { Lead, RelayTask, RevenueIdentity, RevenueIdentityWithAssignment } from '@/lib/domain/types'
import { RelayTodayWorkspaceAsync } from '@/components/relay-today-workspace-async'
import type { RelayTodayAction, RelayTodayWorkspaceProps } from '@/components/relay-today-workspace'

export const dynamic = 'force-dynamic'

type IdentityRef = {
  id: string
  identityName: string
  title: string | null
  channel: string
  profileId: string | null
}

async function loadDashboardData(): Promise<RelayTodayWorkspaceProps> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const roleContext = buildRoleContext(user.rep, user.organization)
  const isAdmin = user.rep.role === 'admin'

  const [
    dash,
    relayData,
    allLeads,
    allReps,
    revenueIdentities,
    todayAccountability,
    teamAccountability,
  ] = await Promise.all([
    store.getTodayDashboard(),
    store.getRelayQueueData(),
    store.fetchLeadsAll(),
    isAdmin ? store.listAllReps().catch(() => undefined) : Promise.resolve(undefined),
    (isAdmin
      ? store.listRevenueIdentitiesAdmin().then((identities) =>
          identities.filter((identity) => identity.status === 'active').map(mapIdentity),
        )
      : store.listMyAssignedIdentities().then((identities) => identities.map(mapAssignedIdentity))
    ).catch((): IdentityRef[] => []),
    store.getMyTodayAccountability().catch(() => null),
    isAdmin ? store.getTeamAccountabilityAdmin().catch(() => null) : Promise.resolve(null),
  ])

  const queue = buildRelayQueue({
    roleContext,
    queueData: dash.mine,
    followupsDue: dash.followupsDue,
    upwork: dash.upwork,
    conversations: relayData.conversations,
    messagesByLead: relayData.messagesByLead,
    messagesByJob: relayData.messagesByJob,
    assignedProfiles: relayData.assignedProfiles,
    allReps,
    allLeads,
  })

  const visibleTasks = filterQueueByRole(queue, roleContext.role)

  const leadMap = new Map(allLeads.map((lead) => [lead.id, lead]))
  const identityByProfile = new Map(
    revenueIdentities
      .filter((identity) => identity.profileId)
      .map((identity) => [identity.profileId as string, identity]),
  )

  const actions: RelayTodayAction[] = visibleTasks.map((task) => {
    const lead = leadMap.get(task.entityId)
    const profileId = task.entityType === 'lead'
      ? relayData.conversations.get(task.entityId)?.senderProfileId ?? null
      : null
    const identity = resolveIdentity({
      task,
      lead,
      profileId,
      identityByProfile,
      allIdentities: revenueIdentities,
    })
    const proof = pickProof(task)

    return {
      id: task.id,
      kind: task.kind,
      priority: task.priority,
      title: cleanTitle(task.title),
      subtitle: pickSubtitle(task),
      href: entityHref(task),
      whatHappened: task.whatHappened,
      whyItMatters: task.whyItMatters,
      whyLines: pickWhyLines(task),
      prepared: task.recommendation.preparedOutput ?? task.recommendation.action,
      humanAction: task.humanAction,
      createdAt: task.createdAt,
      fitScore: lead?.score ?? null,
      identity,
      proof,
      inbound: task.kind === 'inbound_opportunity',
    }
  })

  const conversationTaskKinds = new Set<RelayTask['kind']>(['reply_needed', 'followup_due', 'inbound_opportunity'])
  const opportunityTaskKinds = new Set<RelayTask['kind']>(['high_fit_lead', 'new_opportunity', 'job_worth_apply', 'inbound_opportunity'])

  const conversationsMoving = actions
    .filter((action) => conversationTaskKinds.has(action.kind))
    .slice(0, 3)
    .map((action) => ({
      id: action.id,
      name: action.title,
      signal: action.whyLines[0] ?? action.whatHappened,
      next: action.humanAction,
      href: action.href,
    }))

  const opportunities = actions
    .filter((action) => opportunityTaskKinds.has(action.kind))
    .slice(0, 3)
    .map((action) => {
      return {
        id: action.id,
        name: action.title,
        fit: action.fitScore,
        why: action.whyLines,
        href: action.href,
      }
    })

  const activeConversations = Array.from(relayData.conversations.values())
    .filter((conversation) => !['won', 'lost'].includes(conversation.stage)).length

  const studioOpportunity = dash.contentForToday
    ? {
        title: dash.contentForToday.ideaTitle,
        whyYou: dash.contentForToday.ideaReason,
        href: dash.contentForToday.draftId
          ? `/studio/drafts/${dash.contentForToday.draftId}`
          : `/content/${dash.contentForToday.personaId}/today`,
      }
    : null

  let targetProgress: RelayTodayWorkspaceProps['targetProgress']
  targetProgress = null
  if (todayAccountability && todayAccountability.totalTarget > 0) {
    targetProgress = {
      completed: todayAccountability.totalCompleted,
      total: todayAccountability.totalTarget,
      remaining: todayAccountability.totalRemaining,
      status: todayAccountability.overallStatus,
    }
  }

  let adminSummary: RelayTodayWorkspaceProps['adminSummary']
  adminSummary = null
  if (isAdmin) {
    try {
      if (!teamAccountability) throw new Error('team accountability unavailable')
      const team = teamAccountability
      const teamRows = team.summaries
        .map((summary) => ({
          id: summary.repId,
          name: summary.repName,
          completed: summary.totalCompleted,
          target: summary.totalTarget,
          remaining: summary.remaining,
          status: summary.status,
        }))
        .sort((a, b) => b.remaining - a.remaining)

      const attentionItems = teamRows
        .filter((row) => row.remaining > 0 && (row.status === 'at_risk' || row.status === 'missed' || row.completed === 0))
        .slice(0, 4)
        .map((row) => {
          const severity: 'warning' | 'critical' = row.status === 'missed' ? 'critical' : 'warning'
          return {
            id: row.id,
            title: `${row.name} behind target`,
            detail: `${row.remaining} actions remaining today`,
            severity,
          }
        })

      adminSummary = {
        teamRows,
        attentionItems,
        activeConversations,
        highIntent: actions.filter((action) => action.kind === 'reply_needed' || action.kind === 'inbound_opportunity').length,
        onTrackCount: teamRows.filter((row) => row.status === 'on_track' || row.status === 'completed').length,
        totalReps: teamRows.length,
      }
    } catch {
      adminSummary = null
    }
  }

  return {
    generatedAt: queue.generatedAt,
    role: user.rep.role,
    actions,
    system: {
      conversationsActive: activeConversations,
      conversationsNeedReply: actions.filter((action) => action.kind === 'reply_needed' || action.kind === 'inbound_opportunity').length,
      opportunitiesQualified: actions.filter((action) => opportunityTaskKinds.has(action.kind)).length,
      opportunitiesStrong: actions.filter((action) => action.kind === 'high_fit_lead' || action.kind === 'inbound_opportunity').length,
      followupsDue: dash.followupsDue.length,
      jobsWorthReview: actions.filter((action) => action.kind === 'job_worth_apply' || action.kind === 'proposal_ready').length,
      studioIdeasReady: studioOpportunity ? 1 : 0,
    },
    conversationsMoving,
    opportunities,
    studioOpportunity,
    targetProgress,
    adminSummary,
  }
}

export default function TodayPage() {
  const dataPromise = loadDashboardData()

  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <RelayTodayWorkspaceAsync dataPromise={dataPromise} />
    </Suspense>
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

function mapIdentity(identity: RevenueIdentity): IdentityRef {
  return {
    id: identity.id,
    identityName: identity.identityName,
    title: identity.title,
    channel: identity.channel,
    profileId: identity.profileId,
  }
}

function mapAssignedIdentity(identity: RevenueIdentityWithAssignment): IdentityRef {
  return {
    id: identity.id,
    identityName: identity.identityName,
    title: identity.title,
    channel: identity.channel,
    profileId: identity.profileId,
  }
}

function resolveIdentity({
  task,
  lead,
  profileId,
  identityByProfile,
  allIdentities,
}: {
  task: RelayTask
  lead: Lead | undefined
  profileId: string | null
  identityByProfile: Map<string, IdentityRef>
  allIdentities: IdentityRef[]
}): RelayTodayAction['identity'] {
  if (profileId) {
    const identity = identityByProfile.get(profileId)
    if (identity) {
      return {
        id: identity.id,
        name: identity.identityName,
        title: identity.title,
        channel: identity.channel,
      }
    }
  }

  const channelHint = task.entityType === 'job'
    ? 'upwork'
    : lead?.source === 'linkedin' || lead?.source === 'upwork'
      ? lead.source
      : null

  const fallback = channelHint
    ? allIdentities.find((identity) => identity.channel === channelHint)
    : allIdentities[0]

  if (!fallback) return null
  return {
    id: fallback.id,
    name: fallback.identityName,
    title: fallback.title,
    channel: fallback.channel,
  }
}

function pickProof(task: RelayTask): string | null {
  const proofEvidence = task.recommendation.evidence.find((evidence) => {
    const source = evidence.source.toLowerCase()
    return source.includes('proof') || source.includes('project') || source.includes('verbatim') || source.includes('signal')
  })
  return proofEvidence?.detail ?? null
}

function pickSubtitle(task: RelayTask): string {
  if (task.kind === 'reply_needed' || task.kind === 'inbound_opportunity') {
    const msg = task.recommendation.evidence.find((evidence) => evidence.source === 'message')
    if (msg?.detail) {
      return truncate(msg.detail.replace(/^Their message:\s*/i, ''), 68)
    }
  }
  return task.subtitle
}

function pickWhyLines(task: RelayTask): string[] {
  const lines = [task.whatHappened, task.whyItMatters]
  for (const evidence of task.recommendation.evidence) {
    if (lines.length >= 3) break
    if (evidence.detail && !lines.includes(evidence.detail)) {
      lines.push(evidence.detail)
    }
  }
  return lines.map((line) => truncate(line, 120))
}

function entityHref(task: RelayTask): string {
  if (task.entityType === 'lead') return `/leads/${task.entityId}`
  if (task.entityType === 'job') return `/upwork/${task.entityId}`
  if (task.entityType === 'content') return '/content'
  if (task.entityType === 'admin') return '/admin/command-center'
  return '/dashboard'
}

function cleanTitle(title: string): string {
  return title.replace(/^New inbound\s*[-:]\s*/i, '').trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}...`
}
