import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', user.rep.id)
    .eq('organization_id', user.organization.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return safeErrorResponse(error, 500, 'Failed to load notifications.', 'notifications-app')
  return NextResponse.json({ notifications: data ?? [] })
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
