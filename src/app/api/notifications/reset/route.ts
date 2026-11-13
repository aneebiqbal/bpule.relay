import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { resetNotifications } from '@/lib/notifications/reset'

export const dynamic = 'force-dynamic'

/**
 * Reset the operational notification inbox.
 *
 * Admin-only. Marks the inbox read and drops stale system noise; the audit
 * authorities (action_events, coverage_events) are never touched. Returns the
 * before/after report so the operator can see exactly what changed.
 */
export async function POST() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createServerSupabase()
  try {
    const report = await resetNotifications(supabase, ctx.orgId)
    return NextResponse.json({ ok: true, report })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reset failed' },
      { status: 500 },
    )
  }
}
