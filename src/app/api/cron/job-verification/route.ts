import { NextResponse } from 'next/server'
import { requireCronSecret, createServiceSupabase } from '@/lib/supabase/service'
import { verifyPendingJobs } from '@/lib/job-discovery/verify'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * Bounded employer-source verification tick. Promotes live feed listings to
 * verified_open; never closes a job on an ambiguous check.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '24') || 24, 1), 100)
  if (dryRun) {
    const rows = await createServiceSupabase().raw!<Array<{ id: string }>>(
      `select j.id from jobs j
       left join job_inventory_index ii on ii.job_id = j.id
       where j.verification_status = 'recently_seen' and j.remote = true and j.apply_url is not null
         and (j.last_verified_at is null or j.last_verified_at < ?)
       order by case when ii.feed_bucket = 'eligible_low' then 0 else 1 end,
                coalesce(j.posted_at, j.first_seen_at) desc
       limit ?`,
      [new Date(Date.now() - 7 * 86_400_000).toISOString(), limit],
    )
    if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 })
    return NextResponse.json({ ok: true, dryRun: true, candidates: (rows.data ?? []).length, limit })
  }
  const result = await verifyPendingJobs(createServiceSupabase(), {
    limit,
    timeoutMs: Math.min(Math.max(Number(url.searchParams.get('timeout') ?? '8000') || 8000, 1000), 20_000),
    concurrency: Math.min(Math.max(Number(url.searchParams.get('concurrency') ?? '6') || 6, 1), 12),
  })
  return NextResponse.json({ ok: true, ...result })
}
