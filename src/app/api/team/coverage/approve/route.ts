import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadCoveragePlan } from '@/lib/coverage/load'
import {
  approveCoveragePlan,
  type CoverageApprovalItemInput,
} from '@/lib/coverage/actions'

export const dynamic = 'force-dynamic'

/**
 * Apply an approved coverage plan.
 *
 * The request may only reference items the server has already derived as
 * required, and must use the recommended covering rep. A client cannot invent
 * coverage, choose an ineligible rep, or widen scope.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const requested = Array.isArray(body.items) ? body.items : []
  if (requested.length === 0) {
    return NextResponse.json({ error: 'No coverage items supplied' }, { status: 400 })
  }

  const plan = await loadCoveragePlan(ctx.orgId)
  const byKey = new Map(
    plan.requiresApproval.map((item) => [`${item.profileId}:${item.kind}`, item]),
  )

  const items: CoverageApprovalItemInput[] = []
  for (const raw of requested) {
    const profileId = typeof raw?.profileId === 'string' ? raw.profileId : ''
    const kind = raw?.kind === 'RESTORE_PRIMARY' ? 'RESTORE_PRIMARY' : 'COVER'
    const match = byKey.get(`${profileId}:${kind}`)
    if (!match) {
      return NextResponse.json(
        { error: `Profile ${profileId} is not awaiting ${kind === 'COVER' ? 'coverage' : 'restore'}` },
        { status: 409 },
      )
    }
    // The recommendation is the authority; a client-suggested rep is ignored.
    // A COVER item moves primary → backup; a RESTORE item moves backup → primary.
    const restoring = match.kind === 'RESTORE_PRIMARY'
    items.push({
      profileId: match.profileId,
      primaryRepId: restoring ? match.toRepId : match.fromRepId,
      coveringRepId: restoring ? match.fromRepId : match.toRepId,
      kind: match.kind,
      reason: match.reason,
      effectiveUntil: match.effectiveUntil,
      businessDate: plan.businessDate,
      // Execution mode is required for a COVER; RESTORE has nothing to execute.
      mode: raw?.mode === 'SHARED' ? 'SHARED' : 'REPLACE',
      // Only a restore may return work, and only when the admin asks for it.
      returnOpenTasks: restoring ? raw.returnOpenTasks === true : false,
      returnTaskIds: restoring && Array.isArray(raw.returnTaskIds)
        ? raw.returnTaskIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 200)
        : undefined,
    })
  }

  const result = await approveCoveragePlan({
    organizationId: ctx.orgId,
    items,
    actorRepId: ctx.repId,
    actorName: ctx.orgName,
    auth: ctx,
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'Coverage partially applied',
        results: result.results,
      },
      { status: 207 },
    )
  }

  return NextResponse.json({ ok: true, results: result.results })
}
