import { NextResponse } from 'next/server'
import { requireCronSecret, createServiceSupabase } from '@/lib/supabase/service'
import { prepareHighFitJobs } from '@/lib/job-discovery/preparation'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Bounded automatic preparation. For verified, eligible, high-fit jobs it
 * builds a tailored package for the strongest authorized profile, stores it
 * idempotently and notifies the operator once. Never submits anything.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '2') || 2, 1), 6)
  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, limit })
  }
  const result = await prepareHighFitJobs(createServiceSupabase(), { limit })
  return NextResponse.json({ ok: true, ...result })
}
