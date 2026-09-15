import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('reps')
    .select('id, name, role')
    .eq('organization_id', user.organization.id)
    .order('name', { ascending: true })

  if (error) return safeErrorResponse(error, 500, 'Failed to load team members.', 'reps')
  return NextResponse.json({ reps: data ?? [] })
}
