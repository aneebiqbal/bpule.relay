import { NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/auth/current'

export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  if (user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Only organization admins can delete the organization.' }, { status: 403 })
  }

  const service = createServiceSupabase()

  const { data: members, error: membersErr } = await service
    .from('reps')
    .select('id, auth_user_id')
    .eq('organization_id', user.rep.organizationId)

  if (membersErr) {
    return NextResponse.json({ error: 'Failed to list organization members.' }, { status: 500 })
  }

  const { error: orgErr } = await service
    .from('organizations')
    .delete()
    .eq('id', user.rep.organizationId)

  if (orgErr) {
    return NextResponse.json({ error: 'Failed to delete organization.' }, { status: 500 })
  }

  if (members) {
    for (const member of members) {
      if (member.auth_user_id) {
        await service.auth.admin.deleteUser(member.auth_user_id)
      }
    }
  }

  return NextResponse.json({
    message: 'Organization and all associated data have been deleted.',
    membersRemoved: members?.length ?? 0,
  })
}
