import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { listJobs, type JobsView, type JobFilters } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

const VIEWS: JobsView[] = ['for-you', 'prepared', 'latest', 'verified-remote', 'saved', 'applications', 'documents']

export async function GET(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const url = new URL(request.url)
  const view = (url.searchParams.get('view') ?? 'for-you') as JobsView
  if (!VIEWS.includes(view)) {
    return NextResponse.json({ error: 'Unknown view.' }, { status: 400 })
  }
  const profileId = url.searchParams.get('profileId') ?? undefined
  const search = url.searchParams.get('search') ?? undefined
  const limit = Number(url.searchParams.get('limit') ?? '24')
  const offset = Number(url.searchParams.get('offset') ?? '0')
  const num = (key: string): number | undefined => {
    const raw = url.searchParams.get(key)
    if (raw === null || raw === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }
  const filters: JobFilters = {
    title: url.searchParams.get('title') ?? undefined,
    company: url.searchParams.get('company') ?? undefined,
    location: url.searchParams.get('location') ?? undefined,
    skills: url.searchParams.get('skills')?.split(',').map((s) => s.trim()).filter(Boolean),
    minSalary: num('minSalary'),
    maxSalary: num('maxSalary'),
    seniority: url.searchParams.get('seniority') ?? undefined,
    employmentType: url.searchParams.get('employmentType') ?? undefined,
    freshnessDays: num('freshnessDays'),
    verificationStatus: url.searchParams.get('verificationStatus') ?? undefined,
    matchCategory: url.searchParams.get('matchCategory') ?? undefined,
    sort: (url.searchParams.get('sort') as JobFilters['sort']) ?? undefined,
  }

  const result = await listJobs(store.getSupabaseClient(), auth.orgId, { view, profileId, search, filters, limit, offset })
  return NextResponse.json(result)
}
