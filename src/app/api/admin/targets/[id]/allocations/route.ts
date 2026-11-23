import { NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import type { DbClient } from '@/lib/db/types'
import { replacePlanAllocations } from '@/lib/operations/work-setup-write'

export const dynamic = 'force-dynamic'

/**
 * Per-operator contribution allocations for ONE shared plan lane.
 *
 * GET returns the active allocations. POST replaces them in one review step —
 * `mode: 'shared'` clears the lane, `mode: 'allocated'` writes the shares. The
 * sum of shares may never exceed the lane target; that is the ONE validation,
 * enforced here so no caller can bypass it.
 */

async function requireAdmin() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!can(ctx, 'MANAGE_TEAM_TARGETS')) {
    return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) }
  }
  return { ctx, supabase: await createServerSupabase() }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { data: plan } = await auth.supabase
    .from('daily_target_plans')
    .select('id, organization_id')
    .eq('id', id)
    .eq('organization_id', auth.ctx.orgId)
    .maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const { data, error } = await auth.supabase
    .from('daily_plan_allocations')
    .select('id, rep_id, target_count')
    .eq('organization_id', auth.ctx.orgId)
    .eq('plan_id', id)
    .eq('active', true)
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ allocations: data ?? [] })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = (await req.json().catch(() => ({}))) as {
    mode?: unknown
    allocations?: unknown
  }
  const mode = body.mode === 'allocated' ? 'allocated' : 'shared'
  const raw: unknown[] = Array.isArray(body.allocations) ? body.allocations : []

  const { data: plan } = await auth.supabase
    .from('daily_target_plans')
    .select('id, organization_id, target_count, active, revenue_identity_id')
    .eq('id', id)
    .eq('organization_id', auth.ctx.orgId)
    .maybeSingle()
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  if (!plan.active) {
    return NextResponse.json({ error: 'Inactive plans cannot be allocated' }, { status: 400 })
  }

  const rows = raw
    .map((row) =>
      row !== null && typeof row === 'object'
        ? (row as { repId?: unknown; targetCount?: unknown })
        : null,
    )
    .filter((row): row is { repId: unknown; targetCount: unknown } => row !== null)
    .map((row) => ({
      repId: typeof row.repId === 'string' ? row.repId : '',
      targetCount: Math.round(Number(row.targetCount)),
    }))
    .filter((row) => row.repId && row.targetCount > 0)

  // One share per operator.
  const deduped = new Map<string, number>()
  for (const row of rows) deduped.set(row.repId, row.targetCount)

  const total = [...deduped.values()].reduce((sum, value) => sum + value, 0)
  if (mode === 'allocated' && total > plan.target_count) {
    return NextResponse.json(
      { error: `Allocations total ${total}, which exceeds the plan target of ${plan.target_count}.` },
      { status: 400 },
    )
  }

  if (mode === 'allocated' && deduped.size > 0) {
    const repIds = [...deduped.keys()]
    const { data: repRows } = await auth.supabase
      .from('reps')
      .select('id')
      .eq('organization_id', auth.ctx.orgId)
      .in('id', repIds)
    const known = new Set(((repRows ?? []) as Array<{ id: string }>).map((row) => row.id))
    const unknown = repIds.filter((repId) => !known.has(repId))
    if (unknown.length > 0) {
      return NextResponse.json({ error: 'One or more reps are not in this organization' }, { status: 400 })
    }

    // An allocation is an executable expectation: the rep must hold an active
    // PRIMARY or OPERATOR seat on the account's profile.
    const { data: identityRows } = await auth.supabase
      .from('revenue_identities')
      .select('profile_id')
      .eq('organization_id', auth.ctx.orgId)
      .eq('id', plan.revenue_identity_id)
      .limit(1)
    const profileId = (identityRows?.[0]?.profile_id as string | null) ?? null
    if (profileId) {
      const { data: seatRows } = await auth.supabase
        .from('profile_coverage')
        .select('rep_id')
        .eq('organization_id', auth.ctx.orgId)
        .eq('profile_id', profileId)
        .eq('active', true)
        .in('role', ['PRIMARY', 'OPERATOR'])
        .limit(200)
      const seated = new Set(((seatRows ?? []) as Array<{ rep_id: string }>).map((row) => row.rep_id))
      const unseated = repIds.filter((repId) => !seated.has(repId))
      if (unseated.length > 0) {
        return NextResponse.json(
          { error: 'One or more reps have no executable seat on this account.' },
          { status: 400 },
        )
      }
    }
  }

  // Replace atomically (one physical transaction when the provider supports
  // it): update-in-place, insert new, deactivate removed — so a failure never
  // leaves the lane empty.
  const write = (c: DbClient) =>
    replacePlanAllocations(c, {
      orgId: auth.ctx.orgId,
      planId: id,
      actorRepId: auth.ctx.repId,
      shares: mode === 'shared' ? new Map<string, number>() : deduped,
    })
  // Fail closed: allocation replacement is only safe inside one transaction.
  if (!auth.supabase.transaction) {
    return NextResponse.json(
      { error: 'This database provider does not support transactions; refusing a non-atomic allocation update.' },
      { status: 503 },
    )
  }
  const replaced = await auth.supabase.transaction(write)
  if (!replaced.ok) return NextResponse.json({ error: replaced.error }, { status: 500 })

  return NextResponse.json({ ok: true, mode, count: deduped.size })
}
