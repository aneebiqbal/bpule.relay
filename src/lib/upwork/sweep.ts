/**
 * Upwork lifecycle notification sweep.
 *
 * Runs inside the existing EMIT_WARNING operational job — no second scheduler.
 * Emits exactly one notification per lifecycle step per recipient:
 *   follow-up 1 due, follow-up 2 due, archive candidate.
 * Dedupe is recipient-specific and deterministic, so repeated sweeps are no-ops.
 */
import type { DbClient } from '@/lib/db/types'
import { notifyOnce } from '@/lib/notifications/deliver'
import { followUpDueAt, isArchiveCandidate, type UpworkJobStatus } from '@/lib/upwork/lifecycle'

interface ApplicationRow {
  id: string
  job_id: string
  rep_id: string | null
  submitted_at: string | null
  first_reply_at: string | null
}

interface JobRow {
  id: string
  title: string
  status: string
  owner_rep_id: string | null
}

interface FollowUpRow {
  job_id: string
  sent_at: string | null
  created_at: string
}

function daysSince(iso: string, now: Date): number {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000))
}

export async function emitUpworkLifecycleNotifications(
  client: DbClient,
  organizationId: string,
  now: Date,
): Promise<{ followUp1: number; followUp2: number; archiveCandidate: number }> {
  const nowIso = now.toISOString()
  const { data: applications, error } = await client
    .from('upwork_applications')
    .select('id, job_id, rep_id, submitted_at, first_reply_at')
    .eq('organization_id', organizationId)
    .not('status', 'eq', 'archived')
  if (error) return { followUp1: 0, followUp2: 0, archiveCandidate: 0 }

  const rows = (applications ?? []) as ApplicationRow[]
  if (rows.length === 0) return { followUp1: 0, followUp2: 0, archiveCandidate: 0 }

  const jobIds = [...new Set(rows.map((row) => row.job_id))]
  const [{ data: jobs, error: jobError }, { data: followUps, error: followUpError }] = await Promise.all([
    client.from('upwork_jobs').select('id, title, status, owner_rep_id').in('id', jobIds),
    client.from('upwork_messages').select('job_id, sent_at, created_at').eq('type', 'followup').in('job_id', jobIds),
  ])
  if (jobError || followUpError) return { followUp1: 0, followUp2: 0, archiveCandidate: 0 }

  const jobById = new Map((jobs ?? []).map((job) => [job.id as string, job as JobRow]))
  const followUpsByJob = new Map<string, string[]>()
  for (const row of (followUps ?? []) as FollowUpRow[]) {
    const at = row.sent_at ?? row.created_at
    if (!at) continue
    const list = followUpsByJob.get(row.job_id) ?? []
    list.push(at)
    followUpsByJob.set(row.job_id, list)
  }

  let followUp1 = 0
  let followUp2 = 0
  let archiveCandidate = 0

  for (const application of rows) {
    const job = jobById.get(application.job_id)
    if (!job) continue
    const status = job.status as UpworkJobStatus
    if (status === 'WON' || status === 'LOST' || status === 'ARCHIVED') continue
    if (application.first_reply_at) continue

    const history = (followUpsByJob.get(application.job_id) ?? []).sort()
    const recipientId = application.rep_id ?? job.owner_rep_id
    if (!recipientId) continue

    if (isArchiveCandidate(application.submitted_at, history, application.first_reply_at, nowIso)) {
      const sent = history.length
      const quietDays = history.length > 0 ? daysSince(history[history.length - 1], now) : 0
      const didSend = await notifyOnce(client, {
        organizationId,
        recipientId,
        type: 'upwork_archive_candidate',
        title: 'Application has gone quiet',
        body: `${job.title}\n${sent} follow-ups sent\nNo client reply for ${quietDays} days`,
        link: `/upwork/${application.job_id}`,
        dedupeKey: `upwork_archive_candidate:${application.job_id}:${nowIso.slice(0, 10)}`,
      })
      if (didSend) archiveCandidate += 1
      continue
    }

    const due = followUpDueAt(application.submitted_at, history, application.first_reply_at)
    if (!due || due > nowIso) continue

    const step = history.length === 0 ? 1 : history.length === 1 ? 2 : null
    if (!step) continue

    const appliedDays = application.submitted_at ? daysSince(application.submitted_at, now) : 0
    const didSend = await notifyOnce(client, {
      organizationId,
      recipientId,
      type: step === 1 ? 'upwork_followup_due' : 'upwork_followup_due',
      title: step === 1 ? 'Follow-up due' : 'Second follow-up due',
      body: `${job.title}\nApplied ${appliedDays} days ago.`,
      link: `/upwork/${application.job_id}`,
      dedupeKey: `upwork_followup_due:${application.job_id}:${step}`,
    })
    if (didSend) {
      if (step === 1) followUp1 += 1
      else followUp2 += 1
    }
  }

  return { followUp1, followUp2, archiveCandidate }
}
