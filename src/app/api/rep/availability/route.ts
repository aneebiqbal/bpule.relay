import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { setRepAvailability } from '@/lib/coverage/actions'

export const dynamic = 'force-dynamic'

const SELF_STATES = ['AVAILABLE', 'ON_LEAVE', 'OFFLINE', 'UNAVAILABLE'] as const

/**
 * A rep's explicit availability for a day.
 *
 * Check-in and check-out remain the rep_day controls; this is the explicit
 * "on leave / unavailable" state that overrides the clock-derived default.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const state = typeof body.state === 'string' ? body.state : ''
  if (!SELF_STATES.includes(state as (typeof SELF_STATES)[number])) {
    return NextResponse.json({ error: 'state must be one of AVAILABLE, ON_LEAVE, OFFLINE, UNAVAILABLE' }, { status: 400 })
  }

  const policy = await loadOperatingPolicy(ctx.orgId)
  const businessDate =
    typeof body.businessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.businessDate)
      ? body.businessDate
      : orgDate(currentInstant(), policy.timezone)

  const result = await setRepAvailability({
    organizationId: ctx.orgId,
    repId: ctx.repId,
    businessDate,
    state: state as (typeof SELF_STATES)[number],
    source: 'SELF',
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    effectiveFrom: typeof body.effectiveFrom === 'string' ? body.effectiveFrom : null,
    effectiveUntil: typeof body.effectiveUntil === 'string' ? body.effectiveUntil : null,
    actorRepId: ctx.repId,
  })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true, businessDate, state })
}
