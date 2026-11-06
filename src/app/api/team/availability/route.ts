import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { setRepAvailability } from '@/lib/coverage/actions'
import type { AvailabilityState } from '@/lib/coverage/engine'

export const dynamic = 'force-dynamic'

const STATES: AvailabilityState[] = [
  'AVAILABLE',
  'WORKING',
  'ON_LEAVE',
  'OFFLINE',
  'CHECKED_OUT',
  'UNAVAILABLE',
]

/**
 * Manager/Admin sets a rep's availability. Admins may set anyone; a manager
 * only someone on a team they manage. The database policy enforces the same
 * rule — this check is so the response is a 403 rather than a 500.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin && !ctx.isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const repId = typeof body.repId === 'string' ? body.repId : ''
  const rawState = typeof body.state === 'string' ? body.state : ''
  if (!repId) return NextResponse.json({ error: 'repId is required' }, { status: 400 })
  if (!STATES.includes(rawState as AvailabilityState)) {
    return NextResponse.json({ error: `state must be one of ${STATES.join(', ')}` }, { status: 400 })
  }
  if (repId === ctx.repId) {
    return NextResponse.json({ error: 'Use /api/rep/availability to set your own availability' }, { status: 400 })
  }

  const managed = new Set(ctx.managedTeamIds)
  if (!ctx.isAdmin) {
    const { createServerSupabase } = await import('@/lib/supabase/server')
    const supabase = await createServerSupabase()
    const { data: memberships } = await supabase
      .from('team_memberships')
      .select('person_id')
      .in('team_id', [...managed])
      .eq('active', true)
    const ids = new Set((memberships ?? []).map((row) => row.person_id as string))
    if (!ids.has(repId)) {
      return NextResponse.json({ error: 'Rep is outside your managed team' }, { status: 403 })
    }
  }

  const policy = await loadOperatingPolicy(ctx.orgId)
  const businessDate =
    typeof body.businessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.businessDate)
      ? body.businessDate
      : orgDate(currentInstant(), policy.timezone)

  const result = await setRepAvailability({
    organizationId: ctx.orgId,
    repId,
    businessDate,
    state: rawState as AvailabilityState,
    source: ctx.isAdmin ? 'ADMIN' : 'MANAGER',
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    effectiveFrom: typeof body.effectiveFrom === 'string' ? body.effectiveFrom : null,
    effectiveUntil: typeof body.effectiveUntil === 'string' ? body.effectiveUntil : null,
    actorRepId: ctx.repId,
  })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true, businessDate, state: rawState })
}
