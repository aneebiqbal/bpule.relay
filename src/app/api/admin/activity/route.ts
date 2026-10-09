import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { getDailySummary, getRepDailyLog, getTodayCounts } from '@/lib/action-ledger'

export const maxDuration = 30

/**
 * GET /api/admin/activity?date=YYYY-MM-DD&repId=optional
 * Get daily operating ledger for admin view.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(ctx, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const repId = url.searchParams.get('repId') || undefined

  if (repId) {
    const log = await getRepDailyLog(ctx.orgId, repId, date)
    return NextResponse.json({ date, repId, log })
  }

  const [summary, todayCounts] = await Promise.all([
    getDailySummary(ctx.orgId, date),
    getTodayCounts(ctx.orgId),
  ])

  return NextResponse.json({ date, summary, todayCounts })
}
