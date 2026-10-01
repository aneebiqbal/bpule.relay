import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { getDailySummary, getRepDailyLog, getTodayCounts } from '@/lib/action-ledger'

export const maxDuration = 30

/**
 * GET /api/admin/activity?date=YYYY-MM-DD&repId=optional
 * Get daily operating ledger for admin view.
 */
export async function GET(req: NextRequest) {
  const store = createServiceSupabase()
  const { data: auth } = await store.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: rep } = await store
    .from('reps')
    .select('id, organization_id, role')
    .eq('user_id', auth.user.id)
    .single()

  if (!rep) return NextResponse.json({ error: 'Not a rep.' }, { status: 401 })

  // Only admins can view team activity
  if (rep.role !== 'admin' && rep.role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const repId = url.searchParams.get('repId') || undefined

  if (repId) {
    // Single rep daily log
    const log = await getRepDailyLog(rep.organization_id, repId, date)
    return NextResponse.json({ date, repId, log })
  }

  // Full team summary
  const [summary, todayCounts] = await Promise.all([
    getDailySummary(rep.organization_id, date),
    getTodayCounts(rep.organization_id),
  ])

  return NextResponse.json({ date, summary, todayCounts })
}
