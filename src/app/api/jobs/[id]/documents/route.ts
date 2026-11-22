import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { getJobDetail, listDocuments, saveDocuments } from '@/lib/job-discovery/service'
import { generateJobDocuments, buildResumeData, tailorResumeForJob, resumeToText, extractPortfolioLinks } from '@/lib/job-discovery/documents'
import { evaluateResumeAgainstJob } from '@/lib/job-discovery/ats'
import { extractJobRequirements } from '@/lib/job-discovery/requirements'
import { assessResume } from '@/lib/job-discovery/ats-score'
import { renderResumePdf, countPdfPages } from '@/lib/job-discovery/pdf'
import type { DiscoveryJob, ResumeLayout, ResumePaper } from '@/lib/job-discovery/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function toDiscoveryJob(row: Record<string, unknown>): DiscoveryJob {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceJobId: String(row.source_job_id),
    title: String(row.title),
    company: (row.company as string | null) ?? undefined,
    companyLogo: (row.company_logo as string | null) ?? undefined,
    locationRaw: (row.location_raw as string | null) ?? undefined,
    remote: Boolean(row.remote),
    employmentType: (row.employment_type as string | null) ?? undefined,
    seniority: (row.seniority as string | null) ?? undefined,
    salaryMin: (row.salary_min as number | null) ?? undefined,
    salaryMax: (row.salary_max as number | null) ?? undefined,
    salaryCurrency: (row.salary_currency as string | null) ?? undefined,
    salaryPeriod: (row.salary_period as string | null) ?? undefined,
    description: (row.description as string | null) ?? '',
    skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
    postedAt: (row.posted_at as string | null) ?? undefined,
    applyUrl: (row.apply_url as string | null) ?? undefined,
    sourceUrl: (row.source_url as string | null) ?? undefined,
    eligibility: row.eligibility ?? null,
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await params
  const url = new URL(request.url)
  const profileId = url.searchParams.get('profileId')
  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  const documents = await listDocuments(store.getSupabaseClient(), auth.orgId, profileId, id)
  return NextResponse.json({ documents })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { profileId?: string; layout?: string; paper?: string }
  if (!body.profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  const layout: ResumeLayout = body.layout === 'technical' || body.layout === 'minimal' || body.layout === 'ultra' ? body.layout : 'modern'
  const paper: ResumePaper = body.paper === 'a4' ? 'a4' : 'letter'

  const profile = await store.getProfile(body.profileId)
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  const detail = await getJobDetail(store.getSupabaseClient(), id)
  if (!detail) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  const job = toDiscoveryJob(detail)
  const evidence = await store.getProfileEvidence(profile.id)

  const documents = await generateJobDocuments(profile, evidence, job)
  const cv = documents.find((doc) => doc.kind === 'cv')
  if (cv) {
    const resume = tailorResumeForJob(buildResumeData(profile, evidence), job)
    const pdf = await renderResumePdf(resumeToText(resume), layout, paper)
    const ats = await evaluateResumeAgainstJob(resume, job, pdf)
    const links = extractPortfolioLinks(profile, evidence)
    const assessment = assessResume({
      resume,
      requirements: extractJobRequirements(job),
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
    cv.ats = { ...ats, readiness: assessment.readiness, documentQuality: assessment.documentQuality, jobMatch: assessment.jobMatch }
    cv.content = { ...(cv.content as Record<string, unknown>), ats, atsAssessment: assessment, layout }
  }

  await saveDocuments(
    store.getSupabaseClient(),
    auth.orgId,
    id,
    profile.id,
    documents.map((doc) => ({
      kind: doc.kind,
      text: doc.text,
      content: { ...doc.content, warnings: doc.warnings, unsupportedClaims: doc.unsupportedClaims, attachments: doc.attachments, evidenceUsed: doc.evidenceUsed },
      ats: doc.ats ?? null,
    })),
  )

  const saved = await listDocuments(store.getSupabaseClient(), auth.orgId, profile.id, id)
  return NextResponse.json({ documents: saved })
}
