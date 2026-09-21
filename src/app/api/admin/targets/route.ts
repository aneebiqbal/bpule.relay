import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import type { ActivityType } from '@/lib/domain/types'

const ACTIVITY_TYPES: ActivityType[] = [
  'dm',
  'connection_request',
  'followup',
  'application',
  'proposal',
  'other',
]

async function requireAdminStore() {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, 'MANAGE_TEAM_TARGETS')) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  try {
    return { store: await createScoutStore() }
  } catch {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  }
}

export async function GET() {
  const auth = await requireAdminStore()
  if (auth.error) return auth.error

  try {
    const [targets, identities, assignments, reps] = await Promise.all([
      auth.store.listDailyTargetsAdmin(),
      auth.store.listRevenueIdentitiesAdmin(),
      auth.store.listIdentityAssignmentsAdmin(),
      auth.store.listAllReps(),
    ])
    return NextResponse.json({ targets, identities, assignments, reps })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load targets.', 'admin/targets')
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminStore()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  const revenueIdentityId = typeof body.revenueIdentityId === 'string' ? body.revenueIdentityId.trim() : ''
  const activityType = typeof body.activityType === 'string' ? body.activityType.trim() : ''
  const targetCount = typeof body.targetCount === 'number' ? body.targetCount : Number(body.targetCount)

  if (!repId || !revenueIdentityId || !ACTIVITY_TYPES.includes(activityType as ActivityType) || !Number.isFinite(targetCount) || targetCount <= 0) {
    return NextResponse.json(
      { error: 'repId, revenueIdentityId, a valid activityType, and a positive targetCount are required.' },
      { status: 400 },
    )
  }

  try {
    if (body.assignIfNeeded === true) {
      const assignments = await auth.store.listIdentityAssignmentsAdmin()
      const already = assignments.some((a) => a.repId === repId && a.revenueIdentityId === revenueIdentityId)
      if (!already) {
        await auth.store.assignIdentityAdmin(revenueIdentityId, repId)
      }
    }

    const target = await auth.store.createDailyTargetAdmin({
      repId,
      revenueIdentityId,
      activityType: activityType as ActivityType,
      targetCount: Math.round(targetCount),
    })
    return NextResponse.json({ target }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('REVENUE_IDENTITY_NOT_ASSIGNED_TO_REP')) {
      return NextResponse.json(
        { error: 'That identity is not assigned to this rep. Assign it first, or enable assign-and-save.' },
        { status: 400 },
      )
    }
    return safeErrorResponse(error, 500, 'Failed to create target.', 'admin/targets')
  }
}
