import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.targetCount === 'number' && body.targetCount > 0) {
    update.target_count = body.targetCount
  }
  if (typeof body.active === 'boolean') {
    update.active = body.active
  }

  const { data, error } = await supabase
    .from('daily_targets')
    .update(update)
    .eq('id', id)
    .eq('organization_id', user.organization.id)
    .select('*')
    .single()

  if (error) return safeErrorResponse(error, 500, 'Failed to update target.', 'admin/targets/[id]')

  await supabase.from('accountability_audit_log').insert({
    organization_id: user.organization.id,
    rep_id: user.rep.id,
    event_type: 'target_changed',
    detail: { target_id: id, changes: update },
  })

  return NextResponse.json({ target: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('daily_targets')
    .delete()
    .eq('id', id)
    .eq('organization_id', user.organization.id)

  if (error) return safeErrorResponse(error, 500, 'Failed to delete target.', 'admin/targets/[id]')

  await supabase.from('accountability_audit_log').insert({
    organization_id: user.organization.id,
    rep_id: user.rep.id,
    event_type: 'target_deleted',
    detail: { target_id: id },
  })

  return NextResponse.json({ ok: true })
}
