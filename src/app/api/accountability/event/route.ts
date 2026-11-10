import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { businessDateForOrg } from '@/lib/org-clock/load'

/**
 * Record a completed activity.
 *
 * This route is an AUTHORIZATION BOUNDARY, not a second completion authority.
 * It verifies the rep may work the identity, then delegates to the ONE
 * canonical writer (`record_activity_event`). Writing `daily_accountability`
 * here directly — as this route used to, with its own hardcoded pace — is how
 * one real action ends up with two credits.
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

  const rawIdentityId = typeof body.revenueIdentityId === 'string' ? body.revenueIdentityId : ''
  const activityType = typeof body.activityType === 'string' ? body.activityType : ''

  if (!rawIdentityId || !activityType) {
    return NextResponse.json({ error: 'revenueIdentityId and activityType are required.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  const { isRevenueIdentityAssignedToRep } = await import('@/lib/auth/workspace')
  const isAuthorized = await isRevenueIdentityAssignedToRep(user.rep.id, rawIdentityId)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Identity not assigned to you.' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('record_activity_event', {
    p_rep_id: user.rep.id,
    p_identity_id: rawIdentityId,
    p_activity_type: activityType,
    p_org_id: user.organization.id,
    p_source_event_id: typeof body.sourceEventId === 'string' ? body.sourceEventId : null,
    p_date: await businessDateForOrg(user.organization.id),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = (data ?? {}) as {
    recorded?: boolean
    reason?: string
    completed_count?: number | null
    target_count?: number | null
  }

  return NextResponse.json({
    ok: result.recorded ?? true,
    recorded: result.recorded ?? true,
    reason: result.reason ?? null,
    completedCount: result.completed_count ?? null,
    targetCount: result.target_count ?? null,
  })
}
