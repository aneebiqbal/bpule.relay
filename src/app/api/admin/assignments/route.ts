import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

interface AssignmentDTO {
  id: string
  organizationId: string
  revenueIdentityId: string
  repId: string
  assignedBy: string
  createdAt: string
}

function mapAssignment(row: Record<string, unknown>): AssignmentDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    revenueIdentityId: row.revenue_identity_id as string,
    repId: row.rep_id as string,
    assignedBy: row.assigned_by as string,
    createdAt: row.created_at as string,
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('identity_assignments')
    .select('id, organization_id, revenue_identity_id, rep_id, assigned_by, created_at')
    .eq('organization_id', user.organization.id)
    .order('created_at', { ascending: false })

  if (error) return safeErrorResponse(error, 500, 'Failed to load assignments.', 'admin/assignments')
  return NextResponse.json({ assignments: (data ?? []).map(mapAssignment) })
}
