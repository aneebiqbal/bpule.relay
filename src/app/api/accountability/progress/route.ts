import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { isRevenueIdentityAssignedToRep } from '@/lib/auth/workspace'

/**
 * Record a canonical business event as progress on the day_close.
 *
 * This is the ONLY path that increments daily progress.
 * Called server-side when Relay detects canonical events.
 * Reps cannot fake this — it's triggered by actual system events.
 *
 * Exactly-once: enforced via source_event_id dedup in the DB function.
 */

const COUNTING_EVENTS: Record<string, string[]> = {
  OUTREACH_RECORDED: ['connections', 'firstDms', 'emails'],
  FOLLOWUP_RECORDED: ['followups'],
  PROSPECT_CAPTURED: ['qualifiedProspects'],
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const revenueIdentityId = typeof body.revenueIdentityId === 'string' ? body.revenueIdentityId : ''
  const eventType = typeof body.eventType === 'string' ? body.eventType : ''
  const sourceEventId = typeof body.sourceEventId === 'string' ? body.sourceEventId : null
  const activityType = typeof body.activityType === 'string' ? body.activityType : ''

  if (!revenueIdentityId || !eventType) {
    return NextResponse.json({ error: 'revenueIdentityId and eventType are required.' }, { status: 400 })
  }

  // SECURITY: Validate identity assignment
  const isAuthorized = await isRevenueIdentityAssignedToRep(ctx.repId, revenueIdentityId)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Identity not assigned to you.' }, { status: 403 })
  }

  // Determine which metric this event counts toward
  const allowedMetrics = COUNTING_EVENTS[eventType]
  if (!allowedMetrics) {
    return NextResponse.json({ ok: true, message: 'Event type does not count toward progress.' })
  }

  // Map activity_type to specific metric
  let metricKey: string | null = null
  if (eventType === 'OUTREACH_RECORDED') {
    if (activityType === 'connection_request') metricKey = 'connections'
    else if (activityType === 'dm') metricKey = 'firstDms'
    else if (activityType === 'email') metricKey = 'emails'
    else metricKey = 'connections' // default
  } else if (eventType === 'FOLLOWUP_RECORDED') {
    metricKey = 'followups'
  } else if (eventType === 'PROSPECT_CAPTURED') {
    metricKey = 'qualifiedProspects'
  }

  if (!metricKey) {
    return NextResponse.json({ ok: true, message: 'Could not determine metric for this event.' })
  }

  const supabase = await createServerSupabase()
  const today = new Date().toISOString().slice(0, 10)

  // Atomically record progress (exactly-once via DB function)
  const { data, error } = await supabase.rpc('record_canonical_progress', {
    p_org_id: ctx.orgId,
    p_person_id: ctx.repId,
    p_revenue_identity_id: revenueIdentityId,
    p_event_type: eventType,
    p_metric_key: metricKey,
    p_source_event_id: sourceEventId,
    p_date: today,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // data is the day_close_id (or null if duplicate/no day_close)
  return NextResponse.json({
    ok: true,
    dayCloseId: data,
    metric: metricKey,
    counted: data !== null,
  })
}
