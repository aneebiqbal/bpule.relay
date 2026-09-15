import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('identity_assignments')
    .select('*')
    .eq('organization_id', user.organization.id)
    .order('created_at', { ascending: false })

  if (error) return safeErrorResponse(error, 500, 'Failed to load assignments.', 'admin/assignments')
  return NextResponse.json({ assignments: data ?? [] })
}
