import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { filterTeamLive } from '@/lib/admin/team-live'

export async function GET() {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const payload = await loadTeamLive(authCtx.orgId)
  const visible = filterTeamLive(payload, {
    repId: authCtx.repId,
    canSeeTeam: can(authCtx, 'VIEW_TEAM_ANALYTICS'),
  })
  return NextResponse.json(visible)
}
