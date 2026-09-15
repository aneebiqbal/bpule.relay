import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'

export async function POST() {
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  try {
    const count = await store.refreshFewShotWins()
    return NextResponse.json({ refreshed: count })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed.' },
      { status: 500 },
    )
  }
}

/**
 * Off-peak scheduled trigger (see vercel.json). Vercel Cron always sends GET
 * with `Authorization: Bearer $CRON_SECRET`; there is no rep session on a
 * scheduled invocation, so this runs on the service-role client instead of
 * the per-rep RLS client the POST handler above uses. Never reachable
 * without the correct secret.
 */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  }

  try {
    const client = createServiceSupabase()
    const { data: orgs, error: orgsErr } = await client
      .from('organizations')
      .select('id')
    if (orgsErr) throw orgsErr

    let total = 0
    for (const org of orgs ?? []) {
      const { data, error } = await client.rpc('refresh_few_shot_wins', {
        p_org_id: org.id,
      })
      if (error) throw error
      total += ((data as number) ?? 0)
    }
    return NextResponse.json({ refreshed: total, organizations: orgs?.length ?? 0 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed.' },
      { status: 500 },
    )
  }
}
