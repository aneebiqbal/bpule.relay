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
import { computeJobMatch } from './match'
import type { DiscoveryJob } from './types'
import { getOrCreateMasterResume, masterResumeHash } from './master-resume'

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
            j.remote, j.description, j.skills, j.employment_type, j.seniority, j.posted_at
     from jobs j
     join job_inventory_index ii on ii.job_id = j.id and ii.include_in_feed
     where j.verification_status = 'verified_open'
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

      // Strongest verified job for this profile.
      let best: { job: DiscoveryJob; score: number; category: string; key: string } | null = null
      for (const candidate of candidates) {
        const job = toJob(candidate)
        const match = computeJobMatch(job, {
          profileId: profile.id,
          headline: profile.headline ?? undefined,
          location: profile.location ?? undefined,
          timezone: 'UTC',
          preferredEngagementTypes: [],
          evidence,
        }, 'verified_open')
        if (match.category === 'not_eligible' || match.category === 'requires_verification') continue
        const key = `${job.id}:${profile.id}:${candidate.content_hash ?? ''}:${template}:${paper}`
        if (!best || match.score > best.score) best = { job, score: match.score, category: match.category, key }
      }
      if (!best) { result.skipped++; continue }

      const existing = await db.raw!<Array<{ id: string }>>(
        `select id from prepared_jobs where idempotency_key = ? limit 1`,
        [best.key],
      )
      if (existing.error) throw new Error(existing.error.message)
      if ((existing.data ?? []).length > 0) { result.skipped++; continue }

      result.checked++
      try {
        const base = buildResumeData(profile, evidence)
        const master = await getOrCreateMasterResume(db, profile.organizationId, profile.id, base, masterResumeHash(profile, evidence))
        const resume = tailorResumeForJob(master.content, best.job)
        const pdf = await renderResumePdf(resumeToText(resume), template, paper)
        const ats = await evaluateResumeAgainstJob(resume, best.job, pdf)
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
        const inserted = await db.raw!(
          `insert into prepared_jobs
             (organization_id, job_id, profile_id, documents, assessment, match_score, match_category, status, idempotency_key, created_at, updated_at)
           values (?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, 'ready', ?, ?, ?)`,
          [profile.organizationId, best.job.id, profile.id, JSON.stringify(documents), JSON.stringify({ ...assessment, ats }), best.score, best.category, best.key, now.toISOString(), now.toISOString()],
        )
        if (inserted.error) throw new Error(inserted.error.message)
        result.prepared++

        await notifyOnce(db, {
          organizationId: profile.organizationId,
          recipientId: profile.repId,
          type: 'job_prepared',
          title: `Application prepared: ${best.job.title}`,
          body: `${best.job.title} at ${best.job.company ?? 'the company'} · fit ${best.score}/100 · document quality ${assessment.documentQuality.score}/100`,
          link: `/jobs/${best.job.id}?profileId=${profile.id}&view=prepared`,
          dedupeKey: `job-prepared:${best.key}`,
        })
      } catch {
        result.failed++
      }
    }
  }

  return result
}
