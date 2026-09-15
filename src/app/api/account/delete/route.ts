import { NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'

export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let authUserId: string
  try {
    const server = await createServerSupabase()
    const { data } = await server.auth.getUser()
    authUserId = data.user!.id
  } catch {
    return NextResponse.json({ error: 'Session error.' }, { status: 401 })
  }

  const service = createServiceSupabase()

  const { count: memberCount, error: countErr } = await service
    .from('reps')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', user.rep.organizationId)

  if (countErr) {
    return NextResponse.json({ error: 'Failed to check organization members.' }, { status: 500 })
  }

  if ((memberCount ?? 0) > 1) {
    const { error: repErr } = await service
      .from('reps')
      .delete()
      .eq('id', user.rep.id)
    if (repErr) {
      return NextResponse.json({ error: 'Failed to remove account.' }, { status: 500 })
    }

    await service.auth.admin.deleteUser(authUserId)

    return NextResponse.json({
      message: 'Your account has been removed from the organization.',
      organizationRetained: true,
    })
  }

  const { error: repErr } = await service
    .from('reps')
    .delete()
    .eq('id', user.rep.id)
  if (repErr) {
    return NextResponse.json({ error: 'Failed to delete account.' }, { status: 500 })
  }

  await service.auth.admin.deleteUser(authUserId)

  const { error: orgErr } = await service
    .from('organizations')
    .delete()
    .eq('id', user.rep.organizationId)
  if (orgErr) {
    return NextResponse.json({ error: 'Failed to delete organization data.' }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Your account and all organization data have been deleted.',
    organizationRetained: false,
  })
}
