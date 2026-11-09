import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext, can } from '@/lib/auth/organization'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const authCtx = await getAuthContext()
  if (!authCtx) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // Deleting a profile is an admin-only action, same as creating/editing one
  // — reps do not manage their own profile lifecycle. Enforced here
  // server-side, independent of the RLS policy on `profiles`.
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized. Ask an admin to remove this profile.' }, { status: 403 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  // A profile with history must be archived, not deleted: the delete cascades
  // knowledge, detaches its sending identities and orphans task attribution.
  const client = store.getSupabaseClient()
  const { data: profileRow } = await client
    .from('profiles')
    .select('id')
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .maybeSingle()
  if (!profileRow) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })

  const [identities, leads, tasks] = await Promise.all([
    client.from('revenue_identities').select('id').eq('profile_id', id).limit(1),
    client.from('leads').select('id').eq('best_profile_id', id).limit(1),
    client.from('assigned_tasks').select('id').eq('profile_id', id).limit(1),
  ])
  const hasHistory = [identities, leads, tasks].some((result) => (result.data?.length ?? 0) > 0)
  if (hasHistory) {
    return NextResponse.json(
      { error: 'This profile has history (identities, leads or tasks). Archive it instead of deleting it.' },
      { status: 409 },
    )
  }

  await store.deleteProfileAdmin(id)
  return NextResponse.json({ ok: true })
}