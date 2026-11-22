import { redirect } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { listJobs, listApplications, listDocuments, listSources, listPreparedJobs, ensureJobMatches, type JobsView, type JobFilters, type PreparedCard } from '@/lib/job-discovery/service'
import { JobsWorkspace } from '@/components/jobs/jobs-workspace'

export const dynamic = 'force-dynamic'

const VIEWS: JobsView[] = ['for-you', 'shortlist', 'prepared', 'latest', 'verified-remote', 'saved', 'applications', 'documents', 'sources']

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const store = await createScoutStore()
  const auth = await getAuthContext()
  if (!auth) redirect('/login')

  const params = await searchParams
  const rawView = typeof params.view === 'string' ? params.view : 'shortlist'
  const view: JobsView = (VIEWS.includes(rawView as JobsView) ? rawView : 'for-you') as JobsView
  const search = typeof params.search === 'string' ? params.search : undefined
  const num = (key: string): number | undefined => {
    const value = Number(params[key])
    return Number.isFinite(value) ? value : undefined
  }
  const filters: JobFilters = {
    title: typeof params.title === 'string' ? params.title : undefined,
    company: typeof params.company === 'string' ? params.company : undefined,
    location: typeof params.location === 'string' ? params.location : undefined,
    skills: typeof params.skills === 'string' ? params.skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    minSalary: num('minSalary'),
    maxSalary: num('maxSalary'),
    seniority: typeof params.seniority === 'string' ? params.seniority : undefined,
    employmentType: typeof params.employmentType === 'string' ? params.employmentType : undefined,
    freshnessDays: num('freshnessDays'),
    verificationStatus: typeof params.verificationStatus === 'string' ? params.verificationStatus : undefined,
    matchCategory: typeof params.matchCategory === 'string' ? params.matchCategory : undefined,
    sort: (typeof params.sort === 'string' ? params.sort : undefined) as JobFilters['sort'],
  }
  const profiles = await store.listProfiles()
  const profileId = typeof params.profileId === 'string' ? params.profileId : (profiles[0]?.id ?? undefined)

  if (view === 'sources' && !(auth.isAdmin || auth.isOwner)) {
    redirect('/jobs?view=latest')
  }

  const limit = 24
  const offset = typeof params.offset === 'string' ? Number(params.offset) || 0 : 0
  // For You and Ready Today are the views that need a stored match. Compute it
  // for the selected profile before reading the list; bounded to the 200 most
  // recent live jobs by ensureJobMatches.
  if ((view === 'for-you' || view === 'shortlist') && profileId) {
    await ensureJobMatches(store.getSupabaseClient(), auth.orgId, profileId)
  }
  const prepared = view === 'prepared'
    ? await listPreparedJobs(store.getSupabaseClient(), auth.orgId, profileId)
    : []
  const { jobs, hasMore } = view === 'prepared'
    ? { jobs: [], hasMore: false }
    : await listJobs(store.getSupabaseClient(), auth.orgId, {
        view,
        profileId,
        search,
        filters,
        limit,
        offset,
      })

  const [applications, documents, sources] = await Promise.all([
    view === 'applications' ? listApplications(store.getSupabaseClient(), auth.orgId, profileId) : Promise.resolve([]),
    view === 'documents' ? listDocuments(store.getSupabaseClient(), auth.orgId, profileId ?? '') : Promise.resolve([]),
    view === 'sources' ? listSources(store.getSupabaseClient()) : Promise.resolve([]),
  ])

  return (
    <JobsWorkspace
      initialView={view}
      views={VIEWS}
      jobs={jobs}
      hasMore={hasMore}
      offset={offset}
      limit={limit}
      search={search ?? ''}
      initialFilters={filters}
      profiles={profiles.map((profile) => ({ id: profile.id, label: profile.label ?? profile.headline ?? 'Profile', platform: profile.platform }))}
      activeProfileId={profileId ?? null}
      applications={applications}
      documents={documents}
      prepared={prepared}
      sources={sources as unknown as Array<Record<string, unknown>>}
      isAdmin={Boolean(auth.isAdmin || auth.isOwner)}
    />
  )
}
