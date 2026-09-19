import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'
import type { DailyTarget } from '@/lib/domain/types'

async function validateIdentityAssignedToRep(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  orgId: string,
  repId: string,
  revenueIdentityId: string,
): Promise<boolean> {
  if (!repId) return true
  const { data } = await supabase
    .from('identity_assignments')
    .select('id')
    .eq('organization_id', orgId)
    .eq('rep_id', repId)
    .eq('revenue_identity_id', revenueIdentityId)
    .maybeSingle()
  return Boolean(data)
}

function mapTarget(row: Record<string, unknown>): DailyTarget {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    repId: row.rep_id as string,
    revenueIdentityId: row.revenue_identity_id as string,
    activityType: row.activity_type as DailyTarget['activityType'],
    targetCount: row.target_count as number,
    active: row.active as boolean,
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('daily_targets')
    .select(`
      *,
      revenue:revenue_identities(id, identity_name, slug),
      rep:reps(id, name)
    `)
    .eq('organization_id', user.organization.id)
    .order('created_at', { ascending: false })

  if (error) return safeErrorResponse(error, 500, 'Failed to load targets.', 'admin/targets')
  return NextResponse.json({ targets: (data ?? []).map(mapTarget) })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const repId = typeof body.repId === 'string' ? body.repId.trim() : ''
  const revenueIdentityId = typeof body.revenueIdentityId === 'string' ? body.revenueIdentityId.trim() : ''
  const activityType = typeof body.activityType === 'string' ? body.activityType.trim() : ''
  const targetCount = typeof body.targetCount === 'number' ? body.targetCount : 0

  if (!repId || !revenueIdentityId || !activityType || targetCount <= 0) {
    return NextResponse.json(
      { error: 'repId, revenueIdentityId, activityType, and positive targetCount are required.' },
      { status: 400 },
    )
  }

  const supabase = await createServerSupabase()

  // Verify rep belongs to org
  const { data: rep } = await supabase
    .from('reps')
    .select('id')
    .eq('id', repId)
    .eq('organization_id', user.organization.id)
    .maybeSingle()
  if (!rep) return NextResponse.json({ error: 'Rep not found.' }, { status: 404 })

  // Verify identity is assigned to this rep
  const assigned = await validateIdentityAssignedToRep(supabase, user.organization.id, repId, revenueIdentityId)
  if (!assigned) {
    return NextResponse.json(
      { error: 'REVENUE_IDENTITY_NOT_ASSIGNED_TO_REP: The selected Revenue Identity is not assigned to this Rep.' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('daily_targets')
    .upsert(
      {
        organization_id: user.organization.id,
        rep_id: repId,
        revenue_identity_id: revenueIdentityId,
        activity_type: activityType,
        target_count: targetCount,
        active: true,
        created_by: user.rep.id,
      },
      { onConflict: 'rep_id,revenue_identity_id,activity_type' },
    )
    .select('*')
    .single()

  if (error) return safeErrorResponse(error, 500, 'Failed to create target.', 'admin/targets')

  await supabase.from('accountability_audit_log').insert({
    organization_id: user.organization.id,
    rep_id: user.rep.id,
    revenue_identity_id: revenueIdentityId,
    event_type: 'target_created',
    detail: { activity_type: activityType, target_count: targetCount, rep_id: repId },
  })

  return NextResponse.json({ target: mapTarget(data) })
}
