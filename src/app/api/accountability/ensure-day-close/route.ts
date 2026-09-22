import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Ensure day_close rows exist for the authenticated rep's assignments.
 * Called on dashboard load so reps always have accountability state
 * without needing to perform an action first.
 */

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const date = typeof body.date === 'string' ? body.date : new Date().toISOString().slice(0, 10)
  const supabase = await createServerSupabase()

  // Ensure day closes for all assigned identities
  const { data, error } = await supabase.rpc('ensure_day_closes_for_person', {
    p_org_id: ctx.orgId,
    p_person_id: ctx.repId,
    p_date: date,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ensured: data ?? [] })
}

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('ensure_day_closes_for_person', {
    p_org_id: ctx.orgId,
    p_person_id: ctx.repId,
    p_date: date,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ensured: data ?? [] })
}
