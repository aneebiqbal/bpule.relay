import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { isRevenueIdentityAssignedToRep } from '@/lib/auth/workspace'
import { createScoutStore } from '@/lib/store'
import { ResponsibilityWorkspaceDetail } from '@/components/rep/responsibility-workspace-detail'
import { ResponsibilityWorkspaceSkeleton } from '@/components/rep/responsibility-workspace-detail'


export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ revenueIdentityId: string }>
}

export default async function WorkspaceDetailPage({ params }: PageProps) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { revenueIdentityId } = await params

  // SECURITY: Verify this rep is authorized to access this identity
  const isAuthorized = await isRevenueIdentityAssignedToRep(user.rep.id, revenueIdentityId)
  if (!isAuthorized) {
    notFound()
  }

  const dataPromise = loadWorkspaceDetail(revenueIdentityId)

  return (
    <Suspense fallback={<ResponsibilityWorkspaceSkeleton />}>
      <ResponsibilityWorkspaceDetail dataPromise={dataPromise} />
    </Suspense>
  )
}

async function loadWorkspaceDetail(identityId: string) {
  const store = await createScoutStore()

  // Get the identity from the store (validates assignment via listMyAssignedIdentities)
  const identity = await store.listMyAssignedIdentities().then((identities) =>
    identities.find((i) => i.id === identityId) ?? null
  )

  if (!identity) {
    notFound()
  }

  // Get accountability data from the store (handles both demo and supabase modes)
  const accountability = await store.getMyTodayAccountability()

  // Filter targets for this specific identity
  const identityAccountability = accountability.assignedIdentities.find(
    (ai) => ai.identity.id === identityId
  )

  const targetViews = identityAccountability?.targets.map((t) => ({
    targetId: t.targetId,
    activityType: t.activityType,
    targetCount: t.targetCount,
    completedCount: t.completedCount,
    remaining: t.remaining,
    status: t.status,
  })) ?? []

  // Get leads associated with this identity from the store
  const allLeads = await store.fetchLeadsAll().catch(() => [])
  const leads = allLeads
    .filter((lead) => lead.revenueIdentityId === identityId)
    .slice(0, 50)
    .map((lead) => ({
      id: lead.id,
      company: lead.company,
      contactName: lead.contactName,
      status: lead.status,
      createdAt: lead.createdAt,
    }))

  return {
    identity: {
      id: identity.id,
      identityName: identity.identityName,
      title: identity.title,
      channel: identity.channel,
      positioning: identity.positioning,
      skills: identity.skills,
      expertise: identity.expertise,
      industries: identity.industries,
      technologies: identity.technologies,
      allowedFirstPersonClaims: identity.allowedFirstPersonClaims,
      profileId: identity.profileId,
      profileUrl: identity.profileUrl,
    },
    targets: targetViews,
    leads,
    today: new Date().toISOString().slice(0, 10),
  }
}
