import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const store = await createScoutStore()
  const today = new Date().toISOString().slice(0, 10)

  if (authCtx.isOwner || authCtx.isAdmin) {
    const teams = await store.listTeams()

    const teamData = await Promise.all(teams.map(async (team) => {
      const members = await store.getTeamMembers(team.id)
      const targets = await store.getTeamTargets(team.id, today)
      const summary = await store.getManagedTeamSummary(authCtx.repId)

      const memberDetails = await Promise.all(members.map(async (member) => {
        const memberTargets = targets.filter((t) => t.repId === member.repId)
        const totalTarget = memberTargets.reduce((sum, t) => sum + t.targetCount, 0)
        const totalCompleted = memberTargets.reduce((sum, t) => sum + t.completedCount, 0)
        const totalRemaining = Math.max(0, totalTarget - totalCompleted)
        const hasAttention = memberTargets.some((t) => t.status === 'at_risk' || t.status === 'missed')

        return {
          repId: member.repId,
          repName: member.repName,
          role: member.role,
          revenueIdentities: memberTargets.map((t) => ({
            identityName: t.identityName,
            channel: t.channel,
            targets: [{
              activityType: t.activityType,
              targetCount: t.targetCount,
              completedCount: t.completedCount,
              remaining: t.remaining,
              status: t.status,
            }],
          })),
          totalTarget,
          totalCompleted,
          totalRemaining,
          attentionReason: hasAttention ? `${totalRemaining} remaining` : null,
        }
      }))

      const teamSummary = summary.find((s) => s.teamId === team.id)

      return {
        teamId: team.id,
        teamName: team.name,
        memberCount: members.length,
        totalTarget: teamSummary?.totalTarget ?? 0,
        totalCompleted: teamSummary?.totalCompleted ?? 0,
        totalRemaining: teamSummary?.totalRemaining ?? 0,
        needsAttention: teamSummary?.needsAttention ?? 0,
        members: memberDetails,
      }
    }))

    return NextResponse.json({ teams: teamData, isOwner: authCtx.isOwner })
  }

  if (authCtx.managedTeamIds.length > 0) {
    const teamData = await Promise.all(authCtx.managedTeamIds.map(async (teamId) => {
      const teamInfo = await store.getTeamInfo(teamId)
      const members = await store.getTeamMembers(teamId)
      const targets = await store.getTeamTargets(teamId, today)

      const memberDetails = await Promise.all(members.map(async (member) => {
        const memberTargets = targets.filter((t) => t.repId === member.repId)
        const totalTarget = memberTargets.reduce((sum, t) => sum + t.targetCount, 0)
        const totalCompleted = memberTargets.reduce((sum, t) => sum + t.completedCount, 0)
        const totalRemaining = Math.max(0, totalTarget - totalCompleted)
        const hasAttention = memberTargets.some((t) => t.status === 'at_risk' || t.status === 'missed')

        return {
          repId: member.repId,
          repName: member.repName,
          role: member.role,
          revenueIdentities: memberTargets.map((t) => ({
            identityName: t.identityName,
            channel: t.channel,
            targets: [{
              activityType: t.activityType,
              targetCount: t.targetCount,
              completedCount: t.completedCount,
              remaining: t.remaining,
              status: t.status,
            }],
          })),
          totalTarget,
          totalCompleted,
          totalRemaining,
          attentionReason: hasAttention ? `${totalRemaining} remaining` : null,
        }
      }))

      return {
        teamId,
        teamName: teamInfo?.name ?? 'My Team',
        memberCount: members.length,
        totalTarget: memberDetails.reduce((sum, m) => sum + m.totalTarget, 0),
        totalCompleted: memberDetails.reduce((sum, m) => sum + m.totalCompleted, 0),
        totalRemaining: memberDetails.reduce((sum, m) => sum + m.totalRemaining, 0),
        needsAttention: memberDetails.filter((m) => m.attentionReason).length,
        members: memberDetails,
      }
    }))

    return NextResponse.json({ teams: teamData, isOwner: false })
  }

  return NextResponse.json({ teams: [], isOwner: false })
}
