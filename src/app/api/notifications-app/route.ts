import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'
import { getDatabaseCapabilities } from '@/lib/operations/capabilities'
import { toRelayNotification, type NotificationRow } from '@/lib/notifications/model'

/**
 * Recipient-only notifications in the canonical RelayNotification shape.
 * `?limit=` (≤100) and `?unread=1`. Narrow columns — no select('*').
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = await createServerSupabase()
  if (!(await getDatabaseCapabilities(supabase)).notifications) {
    return NextResponse.json({ notifications: [], unread: 0, available: false })
  }
  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100)
  let query = supabase
    .from('notifications')
    .select('id, notification_type, title, body, link, read, created_at')
    .eq('recipient_id', user.rep.id)
    .eq('organization_id', user.organization.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (url.searchParams.get('unread') === '1') query = query.eq('read', false)

  const [{ data, error }, unreadRes] = await Promise.all([
    query,
    supabase
      .from('notifications')
      .select('id', { head: true, count: 'exact' })
      .eq('recipient_id', user.rep.id)
      .eq('organization_id', user.organization.id)
      .eq('read', false),
  ])

  if (error) return safeErrorResponse(error, 500, 'Failed to load notifications.', 'notifications-app')
  return NextResponse.json({
    notifications: ((data ?? []) as NotificationRow[]).map(toRelayNotification),
    unread: unreadRes.count ?? 0,
    available: true,
  })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  let body: { id?: string; markAllRead?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const supabase = await createServerSupabase()

  if (body.markAllRead) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', user.rep.id)
      .eq('organization_id', user.organization.id)
      .eq('read', false)

    if (error) return safeErrorResponse(error, 500, 'Failed to update notifications.', 'notifications-app')
    return NextResponse.json({ ok: true })
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'Notification id is required.' }, { status: 400 })

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)
    .eq('recipient_id', user.rep.id)
    .eq('organization_id', user.organization.id)

  if (error) return safeErrorResponse(error, 500, 'Failed to update notification.', 'notifications-app')
  return NextResponse.json({ ok: true })
}
