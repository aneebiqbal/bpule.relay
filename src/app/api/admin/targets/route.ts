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
  'prospect_extracted',
  'other',
]

async function requireAdminStore() {
  const authCtx = await getAuthContext()
  if (!authCtx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(authCtx, 'MANAGE_TEAM_TARGETS')) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  try {
    return { authCtx, store: await createScoutStore() }
  } catch {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  }
}

export async function GET() {
  const auth = await requireAdminStore()
  if (auth.error) return auth.error

  try {
    const client = auth.store.getSupabaseClient()
    const today = new Date().toISOString().slice(0, 10)
    const [targets, identities, assignments, reps, coverage, coverageAssignments] = await Promise.all([
      auth.store.listDailyTargetsAdmin(),
      auth.store.listRevenueIdentitiesAdmin(),
      auth.store.listIdentityAssignmentsAdmin(),
      auth.store.listAllReps(),
      client.from('profile_coverage').select('profile_id, rep_id, role, active').eq('organization_id', auth.authCtx.orgId).limit(2000),
      client
        .from('coverage_assignments')
        .select('profile_id, covering_rep_id, status, effective_from, effective_until')
        .eq('organization_id', auth.authCtx.orgId)
        .eq('status', 'ACTIVE')
        .limit(1000),
    ])
    if (coverage.error) throw coverage.error
    if (coverageAssignments.error) throw coverageAssignments.error

    const profileIdByIdentity = new Map(
      (identities ?? []).map((identity) => [identity.id as string, (identity as unknown as { profileId: string | null }).profileId]),
    )
    const primaryByProfileRep = new Set(
      ((coverage.data ?? []) as Array<{ profile_id: string; rep_id: string; role: string; active: boolean }>)
        .filter((row) => row.active && row.role === 'PRIMARY')
        .map((row) => `${row.profile_id}:${row.rep_id}`),
    )
    const coveredByProfileRep = new Set(
      ((coverageAssignments.data ?? []) as Array<{ profile_id: string; covering_rep_id: string; effective_from: string; effective_until: string | null }>)
        .filter((row) => row.effective_from <= today && (row.effective_until === null || row.effective_until >= today))
        .map((row) => `${row.profile_id}:${row.covering_rep_id}`),
    )
    // Only executable responsibility appears as current work. Backup eligibility
    // and stale lanes never show up in the daily-plan editor.
    const isExecutable = (identityId: string, repId: string) => {
      const profileId = profileIdByIdentity.get(identityId)
      if (!profileId) return false
      const key = `${profileId}:${repId}`
      return primaryByProfileRep.has(key) || coveredByProfileRep.has(key)
    }
    const executableTargets = targets.filter((target) => isExecutable(target.revenueIdentityId, target.repId))
    const executableAssignments = assignments.filter((assignment) =>
      isExecutable(assignment.revenueIdentityId, assignment.repId),
    )

    return NextResponse.json({
      targets: executableTargets,
      identities,
      assignments: executableAssignments,
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
