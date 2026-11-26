import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { businessDateForOrg } from '@/lib/org-clock/load'
import type { DbClient } from '@/lib/db/types'
import { CanonicalActivityResolver, loadActivityCatalog } from '@/lib/execution/activity-catalog'

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
  const isAuthorized = await isRevenueIdentityAssignedToRep(rawIdentityId)
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Identity not assigned to you.' }, { status: 403 })
  }

  // Catalog boundary: the key must be a real, enabled activity on THIS
  // identity's channel. Legacy aliases resolve to their canonical key; an
  // unknown key is denied instead of being credited as "other".
  const resolver = new CanonicalActivityResolver(
    await loadActivityCatalog(supabase as unknown as DbClient),
  )
  const identityRow = await supabase
    .from('revenue_identities')
    .select('channel, channel_id')
    .eq('id', rawIdentityId)
    .maybeSingle()
  const identity = (identityRow.data ?? null) as { channel: string | null; channel_id?: string | null } | null
  const channel = resolver.channelForIdentity({ channel: identity?.channel ?? null, channelId: identity?.channel_id ?? null })
  const resolution = resolver.resolve(activityType, channel?.id)
  if (resolution.status !== 'resolved') {
    return NextResponse.json(
      { error: resolution.status === 'disabled' ? `Activity "${activityType}" is disabled.` : `Unknown activity "${activityType}".` },
      { status: 400 },
    )
  }
  const sourceEventId = typeof body.sourceEventId === 'string' ? body.sourceEventId : null
  const policy = resolver.resolveActivityCountingPolicy(resolution.key, channel?.id)
  if (policy?.evidencePolicy === 'provider_event_id' && !sourceEventId) {
    return NextResponse.json({ error: `"${resolution.label}" requires a provider event reference.` }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('record_activity_event', {
    p_rep_id: user.rep.id,
    p_identity_id: rawIdentityId,
    p_activity_type: resolution.key,
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
