import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadCoveragePlan } from '@/lib/coverage/load'
import { restorePrimaryCoverage } from '@/lib/coverage/actions'

export const dynamic = 'force-dynamic'

/** Restore primary coverage for one profile (admin override / return-to-work). */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const profileId = typeof body.profileId === 'string' ? body.profileId : ''
  if (!profileId) return NextResponse.json({ error: 'profileId is required' }, { status: 400 })

  const plan = await loadCoveragePlan(ctx.orgId)
  const profile = plan.profiles.find((row) => row.profileId === profileId)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (!profile.activeCoveringRepId) {
    return NextResponse.json({ error: 'No active coverage to restore' }, { status: 409 })
  }

  const result = await restorePrimaryCoverage({
    organizationId: ctx.orgId,
    profileId,
    actorRepId: ctx.repId,
    actorName: ctx.orgName,
    reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Primary rep is available again',
    businessDate: plan.businessDate,
    // Admin override may also return open work; completed work never moves.
    returnOpenTasks: body.returnOpenTasks === true,
    returnTaskIds: Array.isArray(body.returnTaskIds)
      ? body.returnTaskIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 200)
      : undefined,
    auth: ctx,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Restore failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, assignmentId: result.assignmentId })
}
