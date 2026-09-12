import { NextResponse } from 'next/server'
import { SupabaseStore } from '@/lib/store/supabase-store'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'
import { runEvalHarness } from '@/app/api/eval/run/route'
import type { Rep } from '@/lib/domain/types'

/** Not tied to any real account — exists only so store methods gated on `rep.role === 'admin'` accept a scheduled, unattended run. Never persisted, never returned to a client. */
const CRON_SYSTEM_REP: Rep = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Scheduled job',
  role: 'admin',
  createdAt: new Date(0).toISOString(),
}

/**
 * Off-peak scheduled trigger for the eval harness (see vercel.json). Vercel
 * Cron always sends GET with `Authorization: Bearer $CRON_SECRET`; there is
 * no rep session on a scheduled invocation, so this runs on the service-role
 * client (bypasses RLS) with a synthetic system rep, admin-equivalent for
 * this one unattended action, rather than the per-rep RLS client
 * /api/eval/run's POST handler uses for a human-triggered run.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  try {
    const client = createServiceSupabase()
    const store = new SupabaseStore(CRON_SYSTEM_REP, client)
    const { run, result } = await runEvalHarness(store, 'scheduled')
    return NextResponse.json({ run, result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Eval run failed.' },
      { status: 500 },
    )
  }
}
