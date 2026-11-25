import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const ctx = await getAuthContext()
  if (!ctx) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) }
  if (!ctx.isAdmin && !ctx.isOwner) return { error: NextResponse.json({ error: 'Admin only.' }, { status: 403 }) }
  return { ctx, supabase: await createServerSupabase() }
}

/** Available minutes per rep; null means "not configured". */
export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  try {
    const { data, error } = await auth.supabase
      .from('rep_capacity_settings')
      .select('rep_id, available_minutes')
      .eq('organization_id', auth.ctx.orgId)
      .limit(500)
    if (error) return safeErrorResponse(error, 500, 'Could not load capacity settings.', 'admin/capacity')
    return NextResponse.json({ capacity: data ?? [] })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not load capacity settings.', 'admin/capacity')
  }
}

/** Configure one rep. Null clears the setting and hides utilization. */
export async function PATCH(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const repId = typeof body.repId === 'string' ? body.repId : ''
  if (!repId) return NextResponse.json({ error: 'repId is required.' }, { status: 400 })
  const raw = body.availableMinutes
  const availableMinutes = raw === null || raw === '' ? null : Number(raw)
  if (availableMinutes !== null && (!Number.isFinite(availableMinutes) || availableMinutes <= 0 || availableMinutes > 1440)) {
    return NextResponse.json({ error: 'availableMinutes must be between 1 and 1440, or null.' }, { status: 400 })
  }

  try {
    const { data, error } = await auth.supabase
      .from('rep_capacity_settings')
      .upsert(
        {
          organization_id: auth.ctx.orgId,
          rep_id: repId,
          available_minutes: availableMinutes,
          updated_by: auth.ctx.repId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,rep_id' },
      )
      .select('rep_id, available_minutes')
      .single()
    if (error) return safeErrorResponse(error, 500, 'Could not save capacity.', 'admin/capacity')
    return NextResponse.json({ capacity: data })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Could not save capacity.', 'admin/capacity')
  }
}
