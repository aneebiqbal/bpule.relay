import { NextResponse } from 'next/server'
import { requireCronSecret, createServiceSupabase } from '@/lib/supabase/service'
import { buildRetentionReport } from '@/lib/job-discovery/inventory'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Job retention — read-only dry-run report.
 *
 * Returns the counts a retention pass would touch. It never deletes, archives or
 * hides a job. A source outage is not a closure: only an explicit
 * `closed`/`expired` verification state removes a job from the actionable feed.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  const url = new URL(request.url)
  const sample = Number(url.searchParams.get('sample') ?? 20)
  const report = await buildRetentionReport(createServiceSupabase(), Number.isFinite(sample) ? sample : 20)
  return NextResponse.json({ ok: true, ...report })
}
