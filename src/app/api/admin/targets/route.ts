import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import type { ActivityType } from '@/lib/domain/types'

const ACTIVITY_TYPES: ActivityType[] = [
  'email',
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
    return NextResponse.json({
      targets,
      identities,
      assignments,
      reps,
      defaults: {
        email: defaultTargetsForChannel('email'),
        linkedin: defaultTargetsForChannel('linkedin'),
        upwork: defaultTargetsForChannel('upwork'),
        other: defaultTargetsForChannel('other'),
      },
    })
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

  try {
    if (body.backfillMissing === true) {
      const result = await auth.store.backfillDefaultDailyTargetsAdmin()
      const targets = await auth.store.listDailyTargetsAdmin()
      return NextResponse.json({ ok: true, ...result, targets })
    }

    const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
    const revenueIdentityId = typeof body.revenueIdentityId === 'string' ? body.revenueIdentityId.trim() : ''
    if (!repId || !revenueIdentityId) {
      return NextResponse.json({ error: 'repId and revenueIdentityId are required.' }, { status: 400 })
    }

    if (body.assignIfNeeded === true) {
      const assignments = await auth.store.listIdentityAssignmentsAdmin()
      const already = assignments.some((assignment) => assignment.repId === repId && assignment.revenueIdentityId === revenueIdentityId)
      if (!already) {
        await auth.store.assignIdentityAdmin(revenueIdentityId, repId)
      }
    }

    const activityType = typeof body.activityType === 'string' ? body.activityType.trim() : ''
    const rawCount = typeof body.targetCount === 'number' ? body.targetCount : Number(body.targetCount)
    const wantsSingle = ACTIVITY_TYPES.includes(activityType as ActivityType) && Number.isFinite(rawCount) && rawCount > 0

    if (wantsSingle) {
      const target = await auth.store.createDailyTargetAdmin({
        repId,
        revenueIdentityId,
        activityType: activityType as ActivityType,
        targetCount: Math.round(rawCount),
      })
      return NextResponse.json({ target, targets: [target] }, { status: 201 })
    }

    const targets = await auth.store.ensureDefaultDailyTargetsAdmin({ repId, revenueIdentityId })
    return NextResponse.json({ targets }, { status: 201 })
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
