import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.rep_id) {
    return NextResponse.json({ error: 'rep_id is required.' }, { status: 400 })
  }

  const client = createServiceSupabase()

  const { data: existing } = await client
    .from('profile_assignments')
    .select('id')
    .eq('profile_id', profileId)
    .eq('rep_id', body.rep_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ assignment: existing, alreadyAssigned: true })
  }

  const { data, error } = await client
    .from('profile_assignments')
    .insert({
      profile_id: profileId,
      rep_id: body.rep_id,
    })
    .select()
    .single()

  if (error) return safeErrorResponse(error, 500, 'Failed to assign profile.', 'profile-intelligence/[id]/assign')

  return NextResponse.json({ assignment: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.rep_id) {
    return NextResponse.json({ error: 'rep_id is required.' }, { status: 400 })
  }

  const client = createServiceSupabase()

  const { error } = await client
    .from('profile_assignments')
    .delete()
    .eq('profile_id', profileId)
    .eq('rep_id', body.rep_id)

  if (error) return safeErrorResponse(error, 500, 'Failed to unassign profile.', 'profile-intelligence/[id]/assign')

  return NextResponse.json({ success: true })
}
