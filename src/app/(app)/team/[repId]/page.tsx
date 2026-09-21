import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { ManagerDrillDown } from '@/components/rep/manager-drilldown'
import { ManagerDrillDownSkeleton } from '@/components/rep/manager-drilldown'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ repId: string }>
}

async function loadDrillDownData(repId: string) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  if (!authCtx.isOwner && !authCtx.isAdmin && authCtx.repId !== repId) {
    if (!authCtx.managedTeamIds.some(async (teamId) => {
      const store = await createScoutStore()
      const members = await store.getTeamMembers(teamId)
      return members.some((m) => m.repId === repId)
    })) {
      redirect('/dashboard')
    }
  }

  const store = await createScoutStore()
  const today = new Date().toISOString().slice(0, 10)

  const teamMembers = await Promise.all(
    authCtx.managedTeamIds.map(async (teamId) => {
      const members = await store.getTeamMembers(teamId)
      return members.filter((m) => m.repId === repId)
    })
  )

  const isTeamMember = teamMembers.flat().length > 0 || authCtx.repId === repId

  if (!isTeamMember && !authCtx.isOwner && !authCtx.isAdmin) {
    redirect('/dashboard')
  }

  const repInfo = await store.getRepInfo(repId)

  if (!repInfo) redirect('/dashboard')

  const targets = await store.getMyTodayAccountability()
  const identities = await store.listMyAssignedIdentities()

  const assignments = await store.getRepAssignments(repId)

  return {
    rep: {
      id: repInfo.id,
      name: repInfo.name,
      role: repInfo.role,
    },
    identities: (assignments ?? []).map((a: any) => ({
      assignmentId: a.id,
      revenueIdentityId: a.revenue_identity_id,
      identityName: a.identity?.identity_name ?? 'Unknown',
      title: a.identity?.title ?? null,
      channel: a.identity?.channel ?? 'other',
    })),
    targets: targets.assignedIdentities,
    today,
    isManager: authCtx.isManager,
    managedTeamIds: authCtx.managedTeamIds,
  }
}

export default async function ManagerDrillDownPage({ params }: PageProps) {
  const { repId } = await params
  const dataPromise = loadDrillDownData(repId)

  return (
    <Suspense fallback={<ManagerDrillDownSkeleton />}>
      <ManagerDrillDown dataPromise={dataPromise} />
    </Suspense>
  )
}
