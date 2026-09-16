import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue, filterQueueByRole } from '@/lib/relay/queue-engine'
import type { Lead, RelayTask, RevenueIdentity, RevenueIdentityWithAssignment } from '@/lib/domain/types'
import {
  RelayTodayWorkspace,
  type RelayTodayAction,
  type RelayTodayWorkspaceProps,
} from '@/components/relay-today-workspace'

export const dynamic = 'force-dynamic'

type IdentityRef = {
  id: string
  identityName: string
  title: string | null
  channel: string
  profileId: string | null
}

export default async function TodayPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const roleContext = buildRoleContext(user.rep, user.organization)

  const [dash, relayData, allLeads] = await Promise.all([
    store.getTodayDashboard(),
    store.getRelayQueueData(),
    store.fetchLeadsAll(),
  ])

  let allReps: Awaited<ReturnType<typeof store.listAllReps>> | undefined
  if (user.rep.role === 'admin') {
    try {
      allReps = await store.listAllReps()
    } catch {
      allReps = undefined
    }
  }

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

  let revenueIdentities: IdentityRef[] = []
  try {
    if (user.rep.role === 'admin') {
      const identities = await store.listRevenueIdentitiesAdmin()
      revenueIdentities = identities
        .filter((identity) => identity.status === 'active')
        .map(mapIdentity)
    } else {
      const identities = await store.listMyAssignedIdentities()
      revenueIdentities = identities.map(mapAssignedIdentity)
    }
  } catch {
    revenueIdentities = []
  }

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
  try {
    const today = await store.getMyTodayAccountability()
    if (today.totalTarget > 0) {
      targetProgress = {
        completed: today.totalCompleted,
        total: today.totalTarget,
        remaining: today.totalRemaining,
        status: today.overallStatus,
      }
    }
  } catch {
    targetProgress = null
  }

  let adminSummary: RelayTodayWorkspaceProps['adminSummary']
  adminSummary = null
  if (user.rep.role === 'admin') {
    try {
      const team = await store.getTeamAccountabilityAdmin()
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

  return (
    <RelayTodayWorkspace
      generatedAt={queue.generatedAt}
      role={user.rep.role}
      actions={actions}
      system={{
        conversationsActive: activeConversations,
        conversationsNeedReply: actions.filter((action) => action.kind === 'reply_needed' || action.kind === 'inbound_opportunity').length,
        opportunitiesQualified: actions.filter((action) => opportunityTaskKinds.has(action.kind)).length,
        opportunitiesStrong: actions.filter((action) => action.kind === 'high_fit_lead' || action.kind === 'inbound_opportunity').length,
        followupsDue: dash.followupsDue.length,
        jobsWorthReview: actions.filter((action) => action.kind === 'job_worth_apply' || action.kind === 'proposal_ready').length,
        studioIdeasReady: studioOpportunity ? 1 : 0,
      }}
      conversationsMoving={conversationsMoving}
      opportunities={opportunities}
      studioOpportunity={studioOpportunity}
      targetProgress={targetProgress}
      adminSummary={adminSummary}
    />
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
