import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadCommandCenterData } from '@/lib/admin/command-center-v2'

export const maxDuration = 30

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
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const timezone = (rep.timezone as string) || 'UTC'

  try {
    const data = await loadCommandCenterData(rep.organization_id, date, timezone)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[command-center-v2] failed:', error)
    return NextResponse.json({ error: 'Failed to load.' }, { status: 500 })
  }
}
