import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  let body: { repId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  if (!repId) return NextResponse.json({ error: 'repId is required.' }, { status: 400 })

  const supabase = await createServerSupabase()

  // Verify identity belongs to org
  const { data: identity } = await supabase
    .from('revenue_identities')
    .select('id, identity_name')
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .maybeSingle()

  if (!identity) return NextResponse.json({ error: 'Identity not found.' }, { status: 404 })

  // Verify rep belongs to org
  const { data: rep } = await supabase
    .from('reps')
    .select('id, name')
    .eq('id', repId)
    .eq('organization_id', authCtx.orgId)
    .maybeSingle()

  if (!rep) return NextResponse.json({ error: 'Rep not found.' }, { status: 404 })

  // Upsert assignment (idempotent)
  const { data: assignment, error } = await supabase
    .from('identity_assignments')
    .upsert(
      {
        organization_id: authCtx.orgId,
        revenue_identity_id: id,
        rep_id: repId,
        assigned_by: authCtx.repId,
      },
      { onConflict: 'revenue_identity_id,rep_id' },
    )
    .select('*')
    .single()

  if (error) return safeErrorResponse(error, 500, 'Failed to assign identity.', 'admin/revenue-identities/[id]/assign')

  // Audit
  await supabase.from('accountability_audit_log').insert({
    organization_id: authCtx.orgId,
    rep_id: authCtx.repId,
    revenue_identity_id: id,
    event_type: 'identity_assigned',
    detail: { rep_id: repId, rep_name: rep.name },
  })

  // Emit WORK_ASSIGNED event (non-fatal)
  try {
    await supabase.rpc('emit_relay_event', {
      p_org_id: authCtx.orgId,
      p_event_type: 'WORK_ASSIGNED',
      p_entity_type: 'revenue_identity',
      p_entity_id: id,
      p_actor_type: 'admin',
      p_actor_id: authCtx.repId,
      p_revenue_identity_id: id,
      p_source: 'app',
      p_source_event_id: `work_assigned:${repId}:${id}`,
      p_payload: { rep_id: repId, rep_name: rep.name, identity_name: identity.identity_name },
      p_metadata: {},
    })
  } catch {
    // Event emission must never break the assignment operation
  }

  // Notify the rep
  await supabase.from('notifications').insert({
    organization_id: authCtx.orgId,
    recipient_id: repId,
    notification_type: 'identity_assigned',
    title: 'New identity assigned',
    body: `You have been assigned the "${identity.identity_name}" revenue identity.`,
    link: `/rep/assigned-profiles`,
    dedupe_key: `identity_assigned:${repId}:${id}:${new Date().toISOString().slice(0, 10)}`,
  })

  try {
    const store = await createScoutStore()
    const targets = await store.ensureDefaultDailyTargetsAdmin({
      repId,
      revenueIdentityId: id,
    })
    return NextResponse.json({ assignment, targets })
  } catch (error) {
    console.error('[admin/revenue-identities/assign] failed to seed daily pack:', error)
    return NextResponse.json({ assignment, targets: [] })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const repId = url.searchParams.get('repId')
  if (!repId) return NextResponse.json({ error: 'repId query param is required.' }, { status: 400 })

  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('identity_assignments')
    .delete()
    .eq('revenue_identity_id', id)
    .eq('rep_id', repId)
    .eq('organization_id', authCtx.orgId)

  if (error) return safeErrorResponse(error, 500, 'Failed to unassign identity.', 'admin/revenue-identities/[id]/assign')

  await supabase.from('accountability_audit_log').insert({
    organization_id: authCtx.orgId,
    rep_id: authCtx.repId,
    revenue_identity_id: id,
    event_type: 'identity_unassigned',
    detail: { rep_id: repId },
  })

  return NextResponse.json({ ok: true })
}
