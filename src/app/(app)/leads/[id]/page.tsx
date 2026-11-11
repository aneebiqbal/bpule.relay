import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { canOpenLead, resolveOperationalScope } from '@/lib/operations/scope'
import { LeadWorkspaceAsync } from '@/components/lead-workspace-async'
import { LeadDetailSkeleton } from '@/components/sales/lead-detail-skeleton'

export const dynamic = 'force-dynamic'

interface LeadPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const LEAD_TABS = ['conversation', 'tasks', 'activity'] as const

/** Reps the viewer may assign work to — empty for a plain rep. */
async function loadLeadReps() {
  const auth = await getAuthContext()
  if (!auth || (!auth.isManager && !auth.isAdmin && !auth.isOwner)) return []
  const store = await createScoutStore()
  const { data } = await store
    .getSupabaseClient()
    .from('reps')
    .select('id, name')
    .eq('organization_id', auth.orgId)
    .order('name')
    .limit(200)
  return ((data ?? []) as Array<{ id: string; name: string }>).map((rep) => ({ id: rep.id, name: rep.name }))
}

async function loadLeadData(id: string) {
  const auth = await getAuthContext()
  if (!auth) notFound()
  const store = await createScoutStore()
  const scope = await resolveOperationalScope(store.getSupabaseClient(), auth)

  // A denial is indistinguishable from a missing lead — the same 404, no
  // existence leak, no stack trace in the UI.
  let lead = null
  try {
    lead = await store.getLead(id, { repIds: scope.repIds })
  } catch {
    lead = null
  }
  if (!lead) notFound()
  if (!canOpenLead(auth, scope, lead)) notFound()

  // Owner attribution for the context panel — a name, never a raw uuid.
  // The lead's SENDER profile must be in the list even when the viewer is not
  // its owner (e.g. an admin working on the team's behalf): otherwise the
  // workspace reads "Profile not assigned" on a lead that plainly has one.
  // `listProfilesByIds` is org-scoped; `getProfile` is rep-scoped and returns
  // null for a colleague's profile, which is exactly the case we must cover.
  const [profiles, queue, owner, senderProfiles] = await Promise.all([
    store.listProfiles(),
    store.getQueue(),
    lead.ownerRepId ? store.getRepInfo(lead.ownerRepId).catch(() => null) : Promise.resolve(null),
    lead.senderProfileId
      ? store.listProfilesByIds([lead.senderProfileId]).catch(() => [])
      : Promise.resolve([]),
  ])
  const senderProfile = senderProfiles[0] ?? null
  const mergedProfiles = senderProfile && !profiles.some((profile) => profile.id === senderProfile.id)
    ? [...profiles, senderProfile]
    : profiles

  return { lead, profiles: mergedProfiles, dailyLimit: queue.dailyLimit, todaySends: queue.todaySends, ownerName: owner?.name ?? null }
}

export default async function LeadPage({ params, searchParams }: LeadPageProps) {
  const dataPromise = params.then(async ({ id }) => loadLeadData(id))
  const reps = await loadLeadReps()
  const raw = await searchParams
  const rawTab = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab
  const initialTab = LEAD_TABS.includes(rawTab as (typeof LEAD_TABS)[number])
    ? (rawTab as (typeof LEAD_TABS)[number])
    : 'overview'

  return (
    <Suspense fallback={<LeadDetailSkeleton />}>
      <LeadWorkspaceAsync
        dataPromise={dataPromise}
        initialTab={initialTab}
        now={Date.now()}
        reps={reps}
      />
    </Suspense>
  )
}
