import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * Open profile-bound tasks for one profile — the return-to-work decision list.
 * Scoped to the org and to the covering rep when supplied.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin && !ctx.isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { profileId } = await params
  const coveringRepId = new URL(request.url).searchParams.get('coveringRepId')

  const store = await createScoutStore()
  let query = store
    .getSupabaseClient()
    .from('assigned_tasks')
    .select('id, title, status, due_at, assignee_rep_id')
    .eq('organization_id', ctx.orgId)
    .eq('profile_id', profileId)
    .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(100)
  if (coveringRepId) query = query.eq('assignee_rep_id', coveringRepId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data ?? [] })
}
