import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext, can } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadCommandCenterData } from '@/lib/admin/command-center-v2'

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(ctx, 'VIEW_TEAM_ANALYTICS')) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]

  const store = await createServerSupabase()
  const { data: repRow } = await store
    .from('reps')
    .select('timezone')
    .eq('id', ctx.repId)
    .maybeSingle()
  const timezone = (repRow?.timezone as string) || 'UTC'

  try {
    const data = await loadCommandCenterData(ctx.orgId, date, timezone)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[command-center-v2] failed:', error)
    return NextResponse.json({ error: 'Failed to load.' }, { status: 500 })
  }
}
