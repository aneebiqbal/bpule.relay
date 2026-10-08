import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'

export const maxDuration = 30

/**
 * GET /api/admin/events?date=YYYY-MM-DD&action=CONNECTION_SENT&repId=optional
 * Get specific action events for drill-down.
 */
export async function GET(req: NextRequest) {
  const store = createServiceSupabase()
  const { data: auth } = await store.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: rep } = await store
    .from('reps')
    .select('id, organization_id, role')
    .eq('user_id', auth.user.id)
    .single()

  if (!rep) return NextResponse.json({ error: 'Not found.' }, { status: 401 })
  if (rep.role !== 'admin' && rep.role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const action = url.searchParams.get('action')
  const repId = url.searchParams.get('repId') || undefined

  if (!action) return NextResponse.json({ error: 'action required.' }, { status: 400 })

  const startOfDay = `${date}T00:00:00.000Z`
  const endOfDay = `${date}T23:59:59.999Z`

  let query = store
    .from('action_events')
    .select(`
      id,
      action_type,
      execution_status,
      occurred_at,
      reps:actor_id (name),
      sender_profiles:sender_profile_id (identity_name),
      leads:lead_id (id, company, contact_name),
      upwork_jobs:job_id (title)
    `)
    .eq('organization_id', rep.organization_id)
    .eq('action_type', action)
    .gte('occurred_at', startOfDay)
    .lt('occurred_at', endOfDay)
    .order('occurred_at', { ascending: false })
    .limit(100)

  if (repId) {
    query = query.eq('actor_id', repId)
  }

  const { data: events } = await query

  return NextResponse.json({
    date,
    action,
    events: (events || []).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      action_type: e.action_type as string,
      execution_status: e.execution_status as string,
      occurred_at: e.occurred_at as string,
      actor_name: ((e.reps as Record<string, unknown> | null)?.name as string) || null,
      sender_profile_name: ((e.sender_profiles as Record<string, unknown> | null)?.identity_name as string) || null,
      lead_company: ((e.leads as Record<string, unknown> | null)?.company as string) || null,
      lead_name: ((e.leads as Record<string, unknown> | null)?.contact_name as string) || null,
      lead_id: ((e.leads as Record<string, unknown> | null)?.id as string) || null,
      job_title: ((e.upwork_jobs as Record<string, unknown> | null)?.title as string) || null,
    })),
  })
}
