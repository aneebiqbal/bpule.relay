import { redirect } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { getJob, getJobDetail } from '@/lib/job-discovery/service'
import { JobDetail } from '@/components/jobs/job-detail'

export const dynamic = 'force-dynamic'

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const store = await createScoutStore()
  const auth = await getAuthContext()
  if (!auth) redirect('/login')
  const { id } = await params
  const query = await searchParams
  const profiles = await store.listProfiles()
  const profileId = typeof query.profileId === 'string' ? query.profileId : (profiles[0]?.id ?? null)

  const [job, detail] = await Promise.all([
    getJob(store.getSupabaseClient(), auth.orgId, id, profileId ?? undefined),
    getJobDetail(store.getSupabaseClient(), id),
  ])
  if (!job || !detail) redirect('/jobs?view=latest')

  return (
    <JobDetail
      job={job}
      detail={detail}
      profiles={profiles.map((profile) => ({ id: profile.id, label: profile.label ?? profile.headline ?? 'Profile', platform: profile.platform }))}
      activeProfileId={profileId}
    />
  )
}
