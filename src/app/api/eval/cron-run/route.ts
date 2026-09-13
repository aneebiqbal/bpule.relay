import { NextResponse } from 'next/server'
import { SupabaseStore } from '@/lib/store/supabase-store'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'
import { runEvalHarness } from '@/app/api/eval/run/route'
import type { Organization, Rep } from '@/lib/domain/types'

const CRON_SYSTEM_ORG: Organization = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'System',
  plan: 'active',
  billingCustomerId: null,
  createdAt: new Date(0).toISOString(),
}

const CRON_SYSTEM_REP: Rep = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Scheduled job',
  role: 'admin',
  organizationId: CRON_SYSTEM_ORG.id,
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
    const store = new SupabaseStore(CRON_SYSTEM_REP, client, CRON_SYSTEM_ORG)
    const { run, result } = await runEvalHarness(store, 'scheduled')
    return NextResponse.json({ run, result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Eval run failed.' },
      { status: 500 },
    )
  }
}
