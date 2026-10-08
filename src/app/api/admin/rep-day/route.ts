import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const maxDuration = 30

/**
 * GET /api/admin/rep-day?repId=X&date=YYYY-MM-DD&tz=Asia/Karachi
 * Get chronological action timeline for a rep on a specific date.
 * Date boundaries use the org's timezone so "today" means the business's today.
 */
export async function GET(req: NextRequest) {
  const store = await createServerSupabase()
  const { data: auth } = await store.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { data: rep } = await store
    .from('reps')
    .select('id, organization_id, role, timezone')
    .eq('user_id', auth.user.id)
    .single()

  if (!rep) return NextResponse.json({ error: 'Not found.' }, { status: 401 })
  if (rep.role !== 'admin' && rep.role !== 'owner') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const repId = url.searchParams.get('repId')
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const timezone = (rep.timezone as string) || 'UTC'

  if (!repId) return NextResponse.json({ error: 'repId required.' }, { status: 400 })

  // Compute timezone-aware UTC boundaries for the local date
  const startUtc = localDateToUtcStart(date, timezone)
  const endUtc = localDateToUtcEnd(date, timezone)

  const { data: events } = await store
    .from('action_events')
    .select(`
      id,
      action_type,
      execution_status,
      channel,
      occurred_at,
      metadata,
      sender_profiles:sender_profile_id (identity_name),
      leads:lead_id (id, company, contact_name, status),
      upwork_jobs:job_id (title)
    `)
    .eq('organization_id', rep.organization_id)
    .eq('actor_id', repId)
    .gte('occurred_at', startUtc)
    .lt('occurred_at', endUtc)
    .order('occurred_at', { ascending: true })
    .limit(100)

  const { data: repInfo } = await store
    .from('reps')
    .select('id, name')
    .eq('id', repId)
    .single()

  const { data: assignedLeads } = await store
    .from('leads')
    .select(`
      id,
      company,
      contact_name,
      status,
      canonical_score,
      conversation_states (stage, last_sent_at, last_reply_at, next_followup_at)
    `)
    .eq('organization_id', rep.organization_id)
    .eq('owner_rep_id', repId)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: accountability } = await store
    .from('day_closes')
    .select('status, completion_snapshot, total_target, total_completed')
    .eq('person_id', repId)
    .eq('date', date)
    .single()

  return NextResponse.json({
    repId,
    repName: repInfo?.name || 'Unknown',
    date,
    events: events || [],
    assignedLeads: assignedLeads || [],
    accountability: accountability || null,
  })
}

/**
 * Convert a local date (YYYY-MM-DD) to UTC ISO string for the start of that day
 * in the given timezone.
 */
function localDateToUtcStart(date: string, timezone: string): string {
  try {
    // Create a date string that represents midnight in the target timezone
    const localMidnight = new Date(`${date}T00:00:00`)
    const localStr = localMidnight.toLocaleString('en-US', { timeZone: timezone })
    const localDate = new Date(localStr)
    const diff = localMidnight.getTime() - localDate.getTime()
    return new Date(localMidnight.getTime() + diff).toISOString()
  } catch {
    return `${date}T00:00:00.000Z`
  }
}

function localDateToUtcEnd(date: string, timezone: string): string {
  try {
    const localEnd = new Date(`${date}T23:59:59.999`)
    const localStr = localEnd.toLocaleString('en-US', { timeZone: timezone })
    const localDate = new Date(localStr)
    const diff = localEnd.getTime() - localDate.getTime()
    return new Date(localEnd.getTime() + diff).toISOString()
  } catch {
    return `${date}T23:59:59.999Z`
  }
}
