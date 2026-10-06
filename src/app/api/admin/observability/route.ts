import { NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { requireCronSecret } from '@/lib/supabase/service'
import {
  generateObservabilityReport,
  checkIntegrity,
  getFallbackStats,
  getLifecycleDistribution,
} from '@/lib/admin/observability'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/observability
 * Returns system health, integrity, and drift metrics.
 * Auth: cron secret or admin role.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  const orgId = request.headers.get('x-org-id')
  if (!orgId) {
    return NextResponse.json({ error: 'Missing x-org-id header.' }, { status: 400 })
  }

  const url = new URL(request.url)
  const type = url.searchParams.get('type')

  try {
    switch (type) {
      case 'integrity': {
        const integrity = await checkIntegrity(orgId)
        return NextResponse.json({ ok: true, integrity })
      }
      case 'fallbacks': {
        const fallbacks = await getFallbackStats(orgId)
        return NextResponse.json({ ok: true, fallbacks })
      }
      case 'lifecycle': {
        const lifecycle = await getLifecycleDistribution(orgId)
        return NextResponse.json({ ok: true, lifecycle })
      }
      default: {
        const report = await generateObservabilityReport(orgId)
        return NextResponse.json({ ok: true, report })
      }
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
