import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { getJobDetail } from '@/lib/job-discovery/service'
import { extractJobRequirements } from '@/lib/job-discovery/requirements'
import { buildScreeningAnswers } from '@/lib/job-discovery/screening'
import type { DiscoveryJob } from '@/lib/job-discovery/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

/** Evidence-grounded screening answers. Unknown facts are flagged, never invented. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await params
  const profileId = new URL(request.url).searchParams.get('profileId')
  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })

  const profile = await store.getProfile(profileId)
  if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  const detail = await getJobDetail(store.getSupabaseClient(), id)
  if (!detail) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })

  const evidence = await store.getProfileEvidence(profile.id)
  const answers = buildScreeningAnswers({
    requirements: extractJobRequirements(toDiscoveryJob(detail)),
    evidence,
    jobTitle: String(detail.title ?? ''),
    company: (detail.company as string | null) ?? null,
  })
  return NextResponse.json({ answers })
}
