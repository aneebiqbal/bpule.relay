import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { routingComparisonViews, scoringCoverage, unverifiedThreads, staleLeadIds } from '@/lib/admin/qa-views'
import {
  messageReviewStats,
  thesisReviewStats,
  routingEvaluationStats,
  modelComparison,
  revenueFunnel,
  sampleMessagesForReview,
  sampleThesesForReview,
} from '@/lib/admin/evaluations'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/qa-views?section=routing|staleness|threads|stale-leads|
 *   model-comparison|funnel|message-stats|thesis-stats|routing-stats|
 *   message-sample|thesis-sample
 *
 * Read-only admin QA data. Nothing here promotes a model or mutates a decision.
 */
export async function GET(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(auth, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const section = searchParams.get('section') ?? 'all'
  const client = await createServerSupabase()

  const out: Record<string, unknown> = {}
  try {
    if (section === 'routing' || section === 'all') out.routing = await routingComparisonViews(client, auth.orgId, auth.repId)
    if (section === 'staleness' || section === 'all') {
      out.staleness = await scoringCoverage(client, auth.orgId)
      out.staleLeadCount = (await staleLeadIds(client, auth.orgId)).length
    }
    if (section === 'threads' || section === 'all') out.threads = await unverifiedThreads(client, auth.orgId)
    if (section === 'model-comparison' || section === 'all') out.modelComparison = await modelComparison(client, auth.orgId)
    if (section === 'funnel' || section === 'all') out.funnel = await revenueFunnel(client, auth.orgId)
    if (section === 'message-stats' || section === 'all') out.messageStats = await messageReviewStats(client, auth.orgId)
    if (section === 'thesis-stats' || section === 'all') out.thesisStats = await thesisReviewStats(client, auth.orgId)
    if (section === 'routing-stats' || section === 'all') out.routingStats = await routingEvaluationStats(client, auth.orgId)
    if (section === 'message-sample' || section === 'all') out.messageSample = await sampleMessagesForReview(client, auth.orgId)
    if (section === 'thesis-sample' || section === 'all') out.thesisSample = await sampleThesesForReview(client, auth.orgId)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'QA views failed.' }, { status: 500 })
  }

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}

export const maxDuration = 30
