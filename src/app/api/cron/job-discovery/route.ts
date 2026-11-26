import { NextResponse } from 'next/server'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'
import { runJobDiscovery } from '@/lib/job-discovery/ingest'
import { runQueuedManualSync } from '@/lib/job-discovery/sync-requests'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Scheduled job discovery worker.
 *
 * systemd timers call this endpoint with the cron secret. It is bounded
 * (default 4 sources per tick) so a 1 vCPU / 4 GB VPS stays responsive; the
 * source schedule spreads the rest across ticks. A database lock makes
 * overlapping timer ticks harmless.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  const url = new URL(request.url)
  const sourceParam = url.searchParams.get('sources')
  const sourceIds = sourceParam ? sourceParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined
  const maxSources = Math.min(Math.max(Number(url.searchParams.get('max') ?? '4') || 4, 1), 8)
  const timeoutMs = Math.min(Math.max(Number(url.searchParams.get('timeout') ?? '8000') || 8000, 1000), 20_000)

  // A manual Sync Now request is executed here, off the request path. Forced so
  // a refresh really re-reads the enabled sources rather than waiting out each
  // source's polling interval.
  const manual = await runQueuedManualSync(createServiceSupabase(), (options) =>
    runJobDiscovery({
      sourceIds: options.sourceIds,
      force: options.force,
      maxSources: 8,
      timeoutMs: 20_000,
    }),
  )

  const result = await runJobDiscovery({ sourceIds, maxSources, timeoutMs })
  return NextResponse.json({ ...result, manual: manual ?? null }, { status: result.ok ? 200 : 423 })
}
