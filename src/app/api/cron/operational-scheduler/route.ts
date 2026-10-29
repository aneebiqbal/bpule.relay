import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/supabase/service'
import { runOperationalScheduler } from '@/lib/scheduler/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * The global operational worker.
 *
 * Runs every 10 minutes in UTC and evaluates each organization against its own
 * local clock. Idempotent: planning produces deterministic keys and the outbox
 * is unique on (organization_id, dedupe_key), so overlapping runs are safe.
 *
 * Returns 503 when a required table is missing, so a half-applied migration is
 * visible in the cron log instead of silently doing nothing.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  const summary = await runOperationalScheduler()
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 })
}
