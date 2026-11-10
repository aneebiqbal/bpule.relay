/**
 * Read-only Upwork data-integrity audit.
 *
 * Every check is explainable: a violation carries a code and the rows involved.
 * Zero unexplained violations is the acceptance bar.
 */
import type { DbClient } from '@/lib/db/types'
import { normalizeJobStatus } from '@/lib/upwork/compat'

interface ApplicationRow {
  id: string
  job_id: string
  organization_id: string
  revenue_identity_id: string | null
  submitted_at: string | null
  connects_spent: number | null
  status: string
}

interface JobRow {
  id: string
  organization_id: string
  status: string
}

interface IdentityRow {
  id: string
  status: string
}

interface TaskRow {
  id: string
  job_id: string | null
  kind: string
  status: string
}

export interface UpworkViolation {
  code: string
  jobId?: string
  applicationId?: string
  detail: string
}

export interface UpworkIntegrityReport {
  violations: UpworkViolation[]
  checked: number
}

export async function auditUpworkIntegrity(client: DbClient, organizationId: string): Promise<UpworkIntegrityReport> {
  const [applications, jobs, identities, tasks] = await Promise.all([
    client.from('upwork_applications').select('id, job_id, organization_id, revenue_identity_id, submitted_at, connects_spent, status').eq('organization_id', organizationId),
    client.from('upwork_jobs').select('id, organization_id, status').eq('organization_id', organizationId),
    client.from('revenue_identities').select('id, status').eq('organization_id', organizationId),
    client.from('assigned_tasks').select('id, job_id, kind, status').eq('organization_id', organizationId),
  ])

  const violations: UpworkViolation[] = []
  const apps = (applications.data ?? []) as ApplicationRow[]
  const jobRows = (jobs.data ?? []) as JobRow[]
  const identityRows = (identities.data ?? []) as IdentityRow[]
  const taskRows = (tasks.data ?? []) as TaskRow[]

  const jobById = new Map(jobRows.map((job) => [job.id, job]))
  const identityById = new Map(identityRows.map((identity) => [identity.id, identity]))
  const applicationByJob = new Map<string, ApplicationRow>()

  for (const app of apps) {
    if (applicationByJob.has(app.job_id)) {
      violations.push({ code: 'DUPLICATE_APPLICATION', jobId: app.job_id, applicationId: app.id, detail: 'more than one application row for the job' })
    }
    applicationByJob.set(app.job_id, app)

    const job = jobById.get(app.job_id)
    if (!job) {
      violations.push({ code: 'ORPHAN_APPLICATION', jobId: app.job_id, applicationId: app.id, detail: 'application points at a missing job' })
      continue
    }
    if (job.organization_id !== app.organization_id) {
      violations.push({ code: 'WRONG_ORG', jobId: app.job_id, applicationId: app.id, detail: 'application organization does not match the job' })
    }
    if (!app.submitted_at) {
      violations.push({ code: 'MISSING_SUBMITTED_AT', jobId: app.job_id, applicationId: app.id, detail: 'application has no submission time' })
    }
    if (app.connects_spent !== null && app.connects_spent < 0) {
      violations.push({ code: 'NEGATIVE_CONNECTS', jobId: app.job_id, applicationId: app.id, detail: `connects_spent=${app.connects_spent}` })
    }
    if (app.revenue_identity_id) {
      const identity = identityById.get(app.revenue_identity_id)
      if (!identity) {
        violations.push({ code: 'INVALID_IDENTITY', jobId: app.job_id, applicationId: app.id, detail: 'revenue_identity_id is not a known identity' })
      } else if (identity.status === 'archived') {
        violations.push({ code: 'ARCHIVED_IDENTITY', jobId: app.job_id, applicationId: app.id, detail: 'application points at an archived identity' })
      }
    }
  }

  for (const job of jobRows) {
    const status = normalizeJobStatus(job.status)
    const hasApplication = applicationByJob.has(job.id)
    if ((status === 'APPLIED' || status === 'CLIENT_REPLIED') && !hasApplication) {
      violations.push({ code: 'APPLIED_WITHOUT_APPLICATION', jobId: job.id, detail: `job is ${status} with no application` })
    }
  }

  for (const task of taskRows) {
    if (!task.job_id || task.kind !== 'FOLLOW_UP') continue
    if (task.status !== 'OPEN' && task.status !== 'IN_PROGRESS') continue
    const job = jobById.get(task.job_id)
    if (!job) continue
    const status = normalizeJobStatus(job.status)
    if (status === 'CLIENT_REPLIED' || status === 'WON' || status === 'LOST' || status === 'ARCHIVED') {
      violations.push({ code: 'PENDING_FOLLOWUP_AFTER_CLOSE', jobId: job.id, detail: `open follow-up task on a ${status} job` })
    }
  }

  return { violations, checked: apps.length + jobRows.length + taskRows.length }
}
