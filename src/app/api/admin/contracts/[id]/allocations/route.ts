import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('contract_allocations')
    .select('*')
    .eq('contract_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ allocations: data ?? [] })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const allocations = body.allocations as { personId: string; allocationPct: number }[]

  const total = allocations.reduce((sum, a) => sum + a.allocationPct, 0)
  if (total !== 100) {
    return NextResponse.json({ error: 'Allocation total must equal 100%' }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  await supabase.from('contract_allocations').delete().eq('contract_id', id)

  const rows = allocations.map((a) => ({
    contract_id: id,
    person_id: a.personId,
    allocation_pct: a.allocationPct,
  }))

  const { data, error } = await supabase
    .from('contract_allocations')
    .insert(rows)
    .select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ allocations: data ?? [] })
}
