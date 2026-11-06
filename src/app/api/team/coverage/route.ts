import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { resolveTaskAssigneeScope } from '@/lib/tasks/assigned-tasks'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  buildCoverageStatusSummary,
  filterCoveragePlanToReps,
} from '@/lib/coverage/engine'
import { loadCoverageFacts, loadCoveragePlan, loadCoverageReview } from '@/lib/coverage/load'

export const dynamic = 'force-dynamic'

/**
 * The daily coverage plan — exceptions only. Admins see the organization;
 * managers see the profiles their managed team touches.
 *
 * `?scope=review&from=YYYY-MM-DD&to=YYYY-MM-DD` returns the weekly review.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin && !ctx.isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const scopeParam = req.nextUrl.searchParams.get('scope')
  const date = req.nextUrl.searchParams.get('date') ?? undefined

  if (scopeParam === 'review') {
    const from = req.nextUrl.searchParams.get('from') ?? undefined
    const to = req.nextUrl.searchParams.get('to') ?? undefined
    const review = await loadCoverageReview(ctx.orgId, { from, to })
    return NextResponse.json({ review })
  }

  const facts = await loadCoverageFacts(ctx.orgId, { date })
  const plan = await loadCoveragePlan(ctx.orgId, { date }, facts)

  let visible = plan
  let availability = facts.availability
  if (!ctx.isAdmin) {
    const supabase = await createServerSupabase()
    const scope = await resolveTaskAssigneeScope(supabase, ctx)
    const ids = scope.assigneeIds ? new Set(scope.assigneeIds) : new Set<string>()
    visible = filterCoveragePlanToReps(plan, ids)
    availability = facts.availability.filter((row) => ids.has(row.repId))
  }

  const summary = buildCoverageStatusSummary({ availability, plan: visible })

  return NextResponse.json({
    plan: visible,
    summary,
    businessDate: facts.businessDate,
    coveragePolicy: facts.coveragePolicy,
    availability: facts.availability,
    maxProfilesPerRep: facts.maxProfilesPerRep,
  })
}
