import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { computeStatus, notificationDedupeKey } from '@/lib/relay/accountability-engine'

/**
 * Record a completed activity event for accountability.
 * Called server-side when Relay detects canonical events (message sent, application submitted, etc.)
 * Reps cannot fake this — it's triggered by actual system events.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const revenueIdentityId = typeof body.revenueIdentityId === 'string' ? body.revenueIdentityId : ''
  const activityType = typeof body.activityType === 'string' ? body.activityType : ''

  if (!revenueIdentityId || !activityType) {
    return NextResponse.json({ error: 'revenueIdentityId and activityType are required.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const org = user.organization
  const rep = user.rep
  const today = new Date().toISOString().slice(0, 10)

  // Find the target for this rep + identity + activity
  const { data: target } = await supabase
    .from('daily_targets')
    .select('*')
    .eq('rep_id', rep.id)
    .eq('revenue_identity_id', revenueIdentityId)
    .eq('activity_type', activityType)
    .eq('active', true)
    .maybeSingle()

  if (!target) return NextResponse.json({ ok: true, message: 'No active target for this activity.' })

  // Upsert accountability row, incrementing completed_count
  const { data: existingAcc } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', rep.id)
    .eq('revenue_identity_id', revenueIdentityId)
    .eq('activity_type', activityType)
    .eq('target_date', today)
    .maybeSingle()

  let newCount = 1
  let accId = existingAcc?.id

  if (existingAcc) {
    newCount = existingAcc.completed_count + 1
    const { data: updated } = await supabase
      .from('daily_accountability')
      .update({
        completed_count: newCount,
        status: computeStatus(target.target_count, newCount, 0.5),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingAcc.id)
      .select('*')
      .single()
    if (updated) accId = updated.id
  } else {
    const { data: created } = await supabase
      .from('daily_accountability')
      .insert({
        organization_id: org.id,
        rep_id: rep.id,
        revenue_identity_id: revenueIdentityId,
        activity_type: activityType,
        target_date: today,
        target_count: target.target_count,
        completed_count: newCount,
        status: computeStatus(target.target_count, newCount, 0.5),
        closed: false,
      })
      .select('*')
      .single()
    if (created) accId = created.id
  }

  // Log to audit
  await supabase.from('accountability_audit_log').insert({
    organization_id: org.id,
    rep_id: rep.id,
    revenue_identity_id: revenueIdentityId,
    event_type: 'work_completed',
    detail: { activity_type: activityType, new_count: newCount },
  })

  return NextResponse.json({ ok: true, completedCount: newCount, accountabilityId: accId })
}
