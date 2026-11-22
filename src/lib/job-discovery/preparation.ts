import type { DbClient } from '@/lib/db/types'
import type { Profile } from '@/lib/domain/types'
import { loadProfileEvidence } from '@/lib/generation/profile-evidence'
import { notifyOnce } from '@/lib/notifications/deliver'
import {
  buildResumeData,
  tailorResumeForJob,
  resumeToText,
  extractPortfolioLinks,
  generateJobDocuments,
} from './documents'
import { evaluateResumeAgainstJob } from './ats'
import { extractJobRequirements } from './requirements'
import { assessResume } from './ats-score'
import { renderResumePdf, countPdfPages } from './pdf'
import { renderResumeDocx } from './docx'
import { isSafeApplicationUrl } from './url'
import { computeJobMatch } from './match'
import type { JobEligibility } from './eligibility'
import type { DiscoveryJob } from './types'
import { getOrCreateMasterResume, masterResumeHash } from './master-resume'
import { buildJobSuggestions } from './suggestions'
import { saveDocuments } from './service'

/** Minimum genuine job-fit score for automatic preparation. */
export const MIN_JOB_FIT = Number(process.env.RELAY_PREPARE_MIN_FIT ?? 65)

async function logPreparation(
  db: DbClient,
  orgId: string,
  jobId: string,
  profileId: string,
  key: string,
  status: string,
  reason: string,
  score: number | null,
): Promise<void> {
  const result = await db.raw!(
    `insert into preparation_logs (organization_id, job_id, profile_id, idempotency_key, status, reason, match_score)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [orgId, jobId, profileId, key, status, reason, score],
  )
  if (result.error) throw new Error(result.error.message)
}

interface ValidationInput {
  documents: Array<{ kind: string; text: string; unsupportedClaims?: string[] }>
  assessment: { documentQuality: { score: number }; readiness: number; jobMatch: { score: number } }
  pdf: Buffer
  docx: Buffer
  links: Array<{ url: string }>
}

/**
 * A package is `ready` only when the evidence, rendered documents and required
 * supporting files all pass. Anything else is a distinct, explainable state.
 */
export function validatePackage(input: ValidationInput): { status: 'ready' | 'needs_evidence' | 'needs_review'; reason: string } {
  const cv = input.documents.find((doc) => doc.kind === 'cv')
  const cover = input.documents.find((doc) => doc.kind === 'cover_letter')
  const proposal = input.documents.find((doc) => doc.kind === 'upwork_proposal')
  if (!cv || !cv.text.trim()) return { status: 'needs_evidence', reason: 'CV content is empty.' }
  if (!cover || !cover.text.trim()) return { status: 'needs_review', reason: 'Cover letter generation failed; review before sending.' }
  if (!proposal || !proposal.text.trim()) return { status: 'needs_review', reason: 'Application note generation failed; review before sending.' }
  const unsupported = input.documents.flatMap((doc) => doc.unsupportedClaims ?? [])
  if (unsupported.length > 0) return { status: 'needs_review', reason: `Unsupported claims: ${unsupported.slice(0, 3).join('; ')}.` }
  if (!input.pdf.subarray(0, 5).toString('latin1').startsWith('%PDF-')) return { status: 'needs_review', reason: 'PDF render failed.' }
  if (input.docx.subarray(0, 2).toString('latin1') !== 'PK') return { status: 'needs_review', reason: 'DOCX render failed.' }
  if (countPdfPages(input.pdf) < 1) return { status: 'needs_review', reason: 'PDF has no pages.' }
  if (input.assessment.documentQuality.score < 80) return { status: 'needs_review', reason: `Document quality ${input.assessment.documentQuality.score}/100 is below the 80 gate.` }
  if (input.links.length > 0 && !input.links.every((link) => isSafeApplicationUrl(link.url))) return { status: 'needs_review', reason: 'A required link is not a valid public destination.' }
  return { status: 'ready', reason: 'Complete package.' }
}

/**
 * Bounded automatic application preparation.
 *
 * For verified, eligible, high-fit jobs, prepare a tailored package for the
 * strongest authorized profile. Idempotent across unchanged job / profile /
 * template versions, and never overwrites a human-edited document.
 */

export interface PrepareOptions {
  now?: Date
  limit?: number
  template?: 'modern' | 'technical' | 'minimal' | 'ultra'
  paper?: 'a4' | 'letter'
}

export interface PrepareResult {
  checked: number
  prepared: number
  skipped: number
  failed: number
}

interface CandidateRow {
  id: string
  source_id: string
  source_job_id: string
  content_hash: string | null
  title: string
  company: string | null
  location_raw: string | null
  remote: boolean
  description: string | null
  skills: string[] | null
  employment_type: string | null
  seniority: string | null
  posted_at: string | null
  eligibility: JobEligibility | null
  apply_url: string | null
}

function mapProfileRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    repId: String(row.rep_id),
    organizationId: String(row.organization_id),
    platform: row.platform === 'upwork' ? 'upwork' : 'linkedin',
    label: (row.label as string | null) ?? null,
    profileUrl: (row.profile_url as string | null) ?? null,
    headline: (row.headline as string | null) ?? null,
    cvPath: (row.cv_path as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    fullName: (row.full_name as string | null) ?? null,
    displayName: (row.display_name as string | null) ?? null,
    currentRole: (row.current_role as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    professionalSummary: (row.professional_summary as string | null) ?? null,
    seniority: (row.seniority as string | null) ?? null,
    yearsExperience: (row.years_experience as number | null) ?? null,
    primarySkills: Array.isArray(row.primary_skills) ? row.primary_skills as string[] : [],
    secondarySkills: Array.isArray(row.secondary_skills) ? row.secondary_skills as string[] : [],
    technologies: Array.isArray(row.technologies) ? row.technologies as string[] : [],
  }
}

function toJob(row: CandidateRow): DiscoveryJob {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceJobId: row.source_job_id,
    title: row.title,
    company: row.company ?? undefined,
    locationRaw: row.location_raw ?? undefined,
    remote: Boolean(row.remote),
    description: row.description ?? '',
    skills: row.skills ?? [],
    employmentType: row.employment_type ?? undefined,
    seniority: row.seniority ?? undefined,
    postedAt: row.posted_at ?? undefined,
    eligibility: (row.eligibility as JobEligibility | null | undefined) ?? undefined,
    applyUrl: row.apply_url ?? undefined,
  }
}

export async function prepareHighFitJobs(db: DbClient, options: PrepareOptions = {}): Promise<PrepareResult> {
  const now = options.now ?? new Date()
  const limit = Math.min(Math.max(options.limit ?? 2, 1), 6)
  const template = options.template ?? 'modern'
  const paper = options.paper ?? 'letter'
  const result: PrepareResult = { checked: 0, prepared: 0, skipped: 0, failed: 0 }

  const jobRows = await db.raw!<CandidateRow[]>(
    `select j.id, j.source_id, j.source_job_id, j.content_hash, j.title, j.company, j.location_raw,
            j.remote, j.description, j.skills, j.employment_type, j.seniority, j.posted_at,
            j.eligibility, j.apply_url
     from jobs j
     join job_inventory_index ii on ii.job_id = j.id and ii.include_in_feed
     where j.verification_status = 'verified_open' and j.remote = true and j.apply_url is not null
     order by coalesce(j.posted_at, j.first_seen_at) desc
     limit 200`,
    [],
  )
  if (jobRows.error) throw new Error(jobRows.error.message)
  const candidates = jobRows.data ?? []
  if (candidates.length === 0) return result

  const orgRows = await db.raw!<Array<{ organization_id: string }>>(
    `select distinct organization_id from profiles where archived_at is null limit 50`,
    [],
  )
  if (orgRows.error) throw new Error(orgRows.error.message)

  for (const org of orgRows.data ?? []) {
    if (result.prepared >= limit) break
    const profileRows = await db.raw!<Array<Record<string, unknown>>>(
      `select * from profiles where organization_id = ? and archived_at is null limit 20`,
      [org.organization_id],
    )
    if (profileRows.error) throw new Error(profileRows.error.message)

    for (const row of profileRows.data ?? []) {
      if (result.prepared >= limit) break
      const profile = mapProfileRow(row)
      const evidence = await loadProfileEvidence(db, profile.id)

      // Strongest verified, eligible, high-fit job for this profile.
      let best: { job: DiscoveryJob; score: number; category: string; key: string } | null = null
      const blocked: Array<{ jobId: string; reason: string; score: number }> = []
      const consider = (reason: string, jobId: string, score: number) => {
        const existing = blocked.find((entry) => entry.jobId === jobId)
        if (existing) {
          if (score > existing.score) existing.score = score
        } else {
          blocked.push({ jobId, reason, score })
        }
      }
      for (const candidate of candidates) {
        const job = toJob(candidate)
        const jobId = job.id ?? ''
        if (!job.remote || !isSafeApplicationUrl(job.applyUrl)) { consider('unsafe_destination', jobId, 0); continue }
        if ((job.eligibility as JobEligibility | undefined)?.pakistan?.eligible !== true) { consider('pakistan_unconfirmed', jobId, 0); continue }
        const match = computeJobMatch(job, {
          profileId: profile.id,
          headline: profile.headline ?? undefined,
          location: profile.location ?? undefined,
          timezone: 'UTC',
          preferredEngagementTypes: [],
          evidence,
        }, 'verified_open')
        if (match.category === 'not_eligible' || match.category === 'requires_verification') {
          consider('eligibility_unconfirmed', jobId, match.score)
          continue
        }
        if (match.score < MIN_JOB_FIT) { consider('low_fit', jobId, match.score); continue }
        if (match.evidence.missingSkills.length > 0) { consider('hard_requirement_gap', jobId, match.score); continue }
        const key = `${jobId}:${profile.id}:${candidate.content_hash ?? ''}:${template}:${paper}`
        if (!best || match.score > best.score) best = { job, score: match.score, category: match.category, key }
      }
      if (!best) {
        const reason = blocked.sort((a, b) => b.score - a.score)[0]
        if (reason) await logPreparation(db, profile.organizationId, reason.jobId, profile.id, '', 'skipped', reason.reason, reason.score)
        result.skipped++
        continue
      }

      const existing = await db.raw!<Array<{ id: string }>>(
        `select id from prepared_jobs where idempotency_key = ? limit 1`,
        [best.key],
      )
      if (existing.error) throw new Error(existing.error.message)
      if ((existing.data ?? []).length > 0) { result.skipped++; continue }

      const bestJobId = best.job.id ?? ''
      result.checked++
      try {
        const base = buildResumeData(profile, evidence)
        const master = await getOrCreateMasterResume(db, profile.organizationId, profile.id, base, masterResumeHash(profile, evidence))
        const resume = tailorResumeForJob(master.content, best.job)
        const pdf = await renderResumePdf(resumeToText(resume), template, paper)
        const ats = await evaluateResumeAgainstJob(resume, best.job, pdf)
        const docx = renderResumeDocx(resumeToText(resume), template, paper)
        const links = extractPortfolioLinks(profile, evidence)
        const assessment = assessResume({
          resume,
          requirements: extractJobRequirements(best.job),
          contact: {
            name: resume.name,
            title: resume.title,
            location: profile.location ?? null,
            links: links.map((link) => link.url),
            email: null,
            phone: null,
          },
          extraction: {
            coverage: ats.extraction.coverage,
            pages: countPdfPages(pdf),
            overflow: ats.formatIssues.some((issue) => /overflow/i.test(issue)),
            missingSections: ats.extraction.missingLines,
          },
        })
        const documents = await generateJobDocuments(profile, evidence, best.job)
        const cvDoc = documents.find((doc) => doc.kind === 'cv')
        if (cvDoc) {
          cvDoc.content = { ...cvDoc.content, suggestions: buildJobSuggestions(resume, extractJobRequirements(best.job), evidence), ats }
          cvDoc.ats = { ...ats, readiness: assessment.readiness, documentQuality: assessment.documentQuality, jobMatch: assessment.jobMatch }
        }
        // Persist the package into the document-version store so the Resume
        // Studio can review, edit and compare it.
        await saveDocuments(db, profile.organizationId, bestJobId, profile.id, documents.map((doc) => ({
          kind: doc.kind,
          text: doc.text,
          content: doc.content,
          ats: doc.ats,
        })))
        const validation = validatePackage({ documents, assessment, pdf, docx, links })
        const inserted = await db.raw!(
          `insert into prepared_jobs
             (organization_id, job_id, profile_id, documents, assessment, match_score, match_category, status, reason, idempotency_key, created_at, updated_at)
           values (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)`,
          [profile.organizationId, bestJobId, profile.id, JSON.stringify(documents), JSON.stringify({ ...assessment, ats }), best.score, best.category, validation.status, validation.reason, best.key, now.toISOString(), now.toISOString()],
        )
        if (inserted.error) throw new Error(inserted.error.message)
        await logPreparation(db, profile.organizationId, bestJobId, profile.id, best.key, validation.status, validation.reason, best.score)
        if (validation.status === 'ready') {
          result.prepared++
          await notifyOnce(db, {
            organizationId: profile.organizationId,
            recipientId: profile.repId,
            type: 'job_prepared',
            title: `Application prepared: ${best.job.title}`,
            body: `${best.job.title} at ${best.job.company ?? 'the company'} · fit ${best.score}/100 · document quality ${assessment.documentQuality.score}/100`,
            link: `/jobs/${bestJobId}?profileId=${profile.id}&view=prepared`,
            dedupeKey: `job-prepared:${best.key}`,
          })
        } else {
          result.skipped++
        }
      } catch (error) {
        result.failed++
        await logPreparation(db, profile.organizationId, bestJobId, profile.id, best.key, 'failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown error', best.score).catch(() => {})
      }
    }
  }

  return result
}
