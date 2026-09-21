import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { OwnerCommandCenter } from '@/components/admin/owner-command-center'
import { OwnerCommandCenterSkeleton } from '@/components/admin/owner-command-center'

export const dynamic = 'force-dynamic'

async function loadCommandCenterData() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  if (!authCtx.isOwner && !authCtx.isAdmin) {
    redirect('/dashboard')
  }

  const store = await createScoutStore()
  const today = new Date().toISOString().slice(0, 10)

  const teams = await store.listTeams()
  const allReps = await store.listAllReps()

  const teamData = await Promise.all(teams.map(async (team) => {
    const members = await store.getTeamMembers(team.id)
    const targets = await store.getTeamTargets(team.id, today)

    const memberDetails = members.map((member) => {
      const memberTargets = targets.filter((t) => t.repId === member.repId)
      const totalTarget = memberTargets.reduce((sum, t) => sum + t.targetCount, 0)
      const totalCompleted = memberTargets.reduce((sum, t) => sum + t.completedCount, 0)
      const totalRemaining = Math.max(0, totalTarget - totalCompleted)
      const hasAttention = memberTargets.some((t) => t.status === 'at_risk' || t.status === 'missed')

      return {
        repId: member.repId,
        repName: member.repName,
        role: member.role,
        totalTarget,
        totalCompleted,
        totalRemaining,
        attentionReason: hasAttention ? `${totalRemaining} remaining` : null,
      }
    })

    const managers = memberDetails.filter((m) => m.role === 'MANAGER')
    const regularMembers = memberDetails.filter((m) => m.role !== 'MANAGER')

    return {
      teamId: team.id,
      teamName: team.name,
      managers,
      members: regularMembers,
      totalTarget: memberDetails.reduce((sum, m) => sum + m.totalTarget, 0),
      totalCompleted: memberDetails.reduce((sum, m) => sum + m.totalCompleted, 0),
      totalRemaining: memberDetails.reduce((sum, m) => sum + m.totalRemaining, 0),
      needsAttention: memberDetails.filter((m) => m.attentionReason).length,
    }
  }))

  const totalTarget = teamData.reduce((sum, t) => sum + t.totalTarget, 0)
  const totalCompleted = teamData.reduce((sum, t) => sum + t.totalCompleted, 0)
  const totalRemaining = Math.max(0, totalTarget - totalCompleted)
  const totalNeedsAttention = teamData.reduce((sum, t) => sum + t.needsAttention, 0)

  return {
    orgName: authCtx.orgName,
    teams: teamData,
    totalReps: allReps.length,
    totalTarget,
    totalCompleted,
    totalRemaining,
    totalNeedsAttention,
    today,
    isOwner: authCtx.isOwner,
  }
}

export default async function CommandCenterPage() {
  const dataPromise = loadCommandCenterData()

  return (
    <Suspense fallback={<OwnerCommandCenterSkeleton />}>
      <OwnerCommandCenter dataPromise={dataPromise} />
    </Suspense>
  )
}
