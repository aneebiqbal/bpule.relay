import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { isProductAdmin } from '@/lib/auth/admin-page'
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
  const authCtx = await getAuthContext()
  const admin = isProductAdmin(user, authCtx)

  if (!admin) {
    const isAuthorized = await isRevenueIdentityAssignedToRep(user.rep.id, revenueIdentityId)
    if (!isAuthorized) notFound()
  }

  const dataPromise = loadWorkspaceDetail(revenueIdentityId, admin)

  return (
    <Suspense fallback={<ResponsibilityWorkspaceSkeleton />}>
      <ResponsibilityWorkspaceDetail dataPromise={dataPromise} />
    </Suspense>
  )
}

async function loadWorkspaceDetail(identityId: string, admin: boolean) {
  const store = await createScoutStore()

  const identity = admin
    ? await store.getRevenueIdentityAdmin(identityId).catch(() => null)
    : await store.listMyAssignedIdentities().then((identities) =>
        identities.find((row) => row.id === identityId) ?? null
      )

  if (!identity) {
    notFound()
  }

  const accountability = await store.getMyTodayAccountability()
  const identityAccountability = accountability.assignedIdentities.find(
    (row) => row.identity.id === identityId
  )

  const targetViews = identityAccountability?.targets.map((target) => ({
    targetId: target.targetId,
    activityType: target.activityType,
    targetCount: target.targetCount,
    completedCount: target.completedCount,
    remaining: target.remaining,
    status: target.status,
  })) ?? []

  const allLeads = admin
    ? await store.fetchLeadsAll().catch(() => [])
    : await store.listOwnedLeads().catch(() => [])
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
