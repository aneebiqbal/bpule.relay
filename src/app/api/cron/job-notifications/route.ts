import { NextResponse } from 'next/server'
import { requireCronSecret, createServiceSupabase } from '@/lib/supabase/service'
import { runJobNotifications } from '@/lib/job-discovery/notifications'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Daily job notification sweep. Dedupe keys prevent repeats. */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })

  const db = createServiceSupabase()
  const now = new Date()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const orgs = await db.raw!<Array<{ organization_id: string }>>(
    `select distinct organization_id from profiles where organization_id is not null limit 50`,
    [],
  )
  const totals = { organizations: 0, newMatches: 0, savedReminders: 0, applicationActions: 0, followups: 0 }
  for (const row of orgs.data ?? []) {
    const counts = await runJobNotifications(db, row.organization_id, now, since)
    totals.organizations++
    totals.newMatches += counts.newMatches
    totals.savedReminders += counts.savedReminders
    totals.applicationActions += counts.applicationActions
    totals.followups += counts.followups
  }
  return NextResponse.json({ ok: true, ...totals })
}
