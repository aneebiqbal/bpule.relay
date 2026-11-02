import { createServerSupabase } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'

export const maxDuration = 30

/**
 * GET /api/admin/events?date=YYYY-MM-DD&action=CONNECTION_SENT&repId=optional
 * Get specific action events for drill-down.
 */
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(ctx, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const store = await createServerSupabase()
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
      actor_id,
      action_type,
      execution_status,
      occurred_at,
      sender_profile_id,
      lead_id,
      job_id
    `)
    .eq('organization_id', ctx.orgId)
    .eq('action_type', action)
    .gte('occurred_at', startOfDay)
    .lt('occurred_at', endOfDay)
    .order('occurred_at', { ascending: false })
    .limit(100)

  if (repId) {
    query = query.eq('actor_id', repId)
  }

  const { data: events } = await query

  // Embed targets are second reads rather than PostgREST embeds
  // (`reps:actor_id`, `leads:lead_id`), which the Neon adapter cannot translate.
  const rows = events ?? []
  const unique = (values: unknown[]) =>
    [...new Set(values.filter((x): x is string => Boolean(x)))]
  const [repRows, profileRows, leadRows, jobRows] = await Promise.all([
    store.from('reps').select('id, name').in('id', unique(rows.map((e) => e.actor_id))),
    store.from('sender_profiles').select('id, identity_name').in('id', unique(rows.map((e) => e.sender_profile_id))),
    store.from('leads').select('id, company, contact_name').in('id', unique(rows.map((e) => e.lead_id))),
    store.from('upwork_jobs').select('id, title').in('id', unique(rows.map((e) => e.job_id))),
  ])
  const repNameById = new Map((repRows.data ?? []).map((r) => [r.id as string, r.name as string]))
  const profileNameById = new Map((profileRows.data ?? []).map((p) => [p.id as string, p.identity_name as string]))
  const leadById = new Map((leadRows.data ?? []).map((l) => [l.id as string, l as Record<string, unknown>]))
  const jobTitleById = new Map((jobRows.data ?? []).map((j) => [j.id as string, j.title as string]))

  return NextResponse.json({
    date,
    action,
    events: rows.map((e) => ({
      id: e.id as string,
      action_type: e.action_type as string,
      execution_status: e.execution_status as string,
      occurred_at: e.occurred_at as string,
      actor_name: repNameById.get(e.actor_id as string) || null,
      sender_profile_name: profileNameById.get(e.sender_profile_id as string) || null,
      lead_company: (leadById.get(e.lead_id as string)?.company as string) || null,
      lead_name: (leadById.get(e.lead_id as string)?.contact_name as string) || null,
      lead_id: (leadById.get(e.lead_id as string)?.id as string) || null,
      job_title: jobTitleById.get(e.job_id as string) || null,
    })),
  })
}
