/**
 * The operational Upwork dashboard: one read, canonical facts only.
 * Applications come from upwork_applications; follow-ups and replies are
 * derived from real rows; nothing is counted from generated proposals.
 */
import type { ScoutStore } from '@/lib/store/types'
import type { AuthContext } from '@/lib/auth/organization'
import { currentInstant } from '@/lib/org-clock'
import { followUpDueAt, isArchiveCandidate } from '@/lib/upwork/lifecycle'
import { isNeedsAction, upworkJobView, type UpworkView } from '@/lib/upwork/views'
import type { UpworkApplication, UpworkJob } from '@/lib/domain/types'

export interface UpworkDashboardSummary {
  applicationsSent: number
  clientReplies: number
  interviews: number
  connectsSpent: number
  followUpsDue: number
}

export interface UpworkDashboard {
  jobs: UpworkJob[]
  applications: UpworkApplication[]
  summary: UpworkDashboardSummary
  views: Record<UpworkView, UpworkJob[]>
  followUpDueJobs: UpworkJob[]
  archiveCandidates: UpworkJob[]
  repNameById: Map<string, string>
  profileNameById: Map<string, string>
  identityNameById: Map<string, string>
}

function followUpsOf(job: UpworkJob): string[] {
  return (job.messages ?? [])
    .filter((m) => m.type === 'followup' && m.direction !== 'inbound' && (m.sentAt ?? m.createdAt))
    .map((m) => m.sentAt ?? m.createdAt)
    .sort()
}

export async function loadUpworkDashboard(
  store: ScoutStore,
  authCtx: AuthContext,
): Promise<UpworkDashboard> {
  const isAdmin = Boolean(authCtx.isAdmin || authCtx.isOwner)
  const now = currentInstant().toISOString()

  const [jobs, applications] = await Promise.all([
    store.listUpworkJobs({ includeArchived: true }),
    store.listUpworkApplications({ repIds: isAdmin ? [] : [authCtx.repId], includeArchived: false }),
  ])

  const applicationByJob = new Map(applications.map((a) => [a.jobId, a]))

  const factsFor = (job: UpworkJob) => {
    const application = applicationByJob.get(job.id) ?? null
    return {
      status: job.status,
      submittedAt: application?.submittedAt ?? null,
      followUps: followUpsOf(job),
      firstReplyAt: application?.firstReplyAt ?? null,
      now,
    }
  }

  const followUpDueJobs: UpworkJob[] = []
  const archiveCandidates: UpworkJob[] = []
  const views = emptyViews()

  for (const job of jobs) {
    const facts = factsFor(job)
    const view = upworkJobView(facts)
    if (job.status !== 'ARCHIVED') {
      views[view].push(job)
      if (isNeedsAction(facts)) views.needs_action.push(job)

      const due = followUpDueAt(facts.submittedAt, facts.followUps, facts.firstReplyAt)
      if (due && due <= now && !facts.firstReplyAt) followUpDueJobs.push(job)
      if (isArchiveCandidate(facts.submittedAt, facts.followUps, facts.firstReplyAt, now)) {
        archiveCandidates.push(job)
      }
    } else {
      views.archived.push(job)
    }
  }
  views.all = [...jobs]

  const summary: UpworkDashboardSummary = {
    applicationsSent: applications.length,
    clientReplies: applications.filter((a) => a.firstReplyAt).length,
    interviews: applications.filter((a) => a.interviewAt).length,
    connectsSpent: applications.reduce((sum, a) => sum + (a.connectsSpent ?? 0) + (a.boostConnects ?? 0), 0),
    followUpsDue: followUpDueJobs.length,
  }

  const repIds = [...new Set(jobs.map((j) => j.ownerRepId).filter((x): x is string => Boolean(x)))]
  const reps = repIds.length > 0 ? await store.listAllReps() : []
  const repNameById = new Map(reps.map((r) => [r.id, r.name]))

  const profileIds = [...new Set(jobs.map((j) => j.senderProfileId).filter((x): x is string => Boolean(x)))]
  const profiles = profileIds.length > 0 ? await store.listProfilesByIds(profileIds) : []
  const profileNameById = new Map(
    profiles.map((p) => [p.id, p.displayName ?? p.fullName ?? p.label ?? 'Unknown']),
  )

  const identityIds = [...new Set(jobs.map((j) => j.revenueIdentityId).filter((x): x is string => Boolean(x)))]
  const client = store.getSupabaseClient()
  const { data: identityRows } = identityIds.length > 0
    ? await client.from('revenue_identities').select('id, identity_name').in('id', identityIds)
    : { data: [] as Array<{ id: string; identity_name: string | null }> }
  const identityNameById = new Map(
    (identityRows ?? []).map((i) => [i.id as string, (i.identity_name as string) ?? 'Unknown']),
  )

  return {
    jobs,
    applications,
    summary,
    views,
    followUpDueJobs,
    archiveCandidates,
    repNameById,
    profileNameById,
    identityNameById,
  }
}

function emptyViews(): Record<UpworkView, UpworkJob[]> {
  return {
    needs_action: [],
    saved: [],
    draft_ready: [],
    applied: [],
    client_replied: [],
    interview: [],
    won: [],
    lost: [],
    archived: [],
    all: [],
  }
}
