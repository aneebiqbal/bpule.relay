import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  formatClock,
  normalizePolicy,
  parseClock,
  validatePolicyInput,
  type OperatingPolicy,
} from '@/lib/org-clock'
import { invalidateOperatingPolicy, loadOperatingPolicy } from '@/lib/org-clock/load'

export const dynamic = 'force-dynamic'

/** The organization's operating clock. Any member may read it. */
export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const policy = await loadOperatingPolicy(ctx.orgId)
  return NextResponse.json({ policy })
}

/**
 * Update the organization's operating clock.
 *
 * This is the switch that changes every rep's day: business date, workday
 * window, working days, reset and pace thresholds. Admin/owner only.
 *
 * Validation is server-side and mirrors the database constraints, so a bad
 * value is rejected before it reaches Postgres.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const current = await loadOperatingPolicy(ctx.orgId)

  // Validate the effective policy (the submitted fields merged over the
  // current one). `normalizePolicy` repairs a reversed window for safety, so
  // normalising first would hide the operator's mistake.
  const candidate = {
    timezone: typeof body.timezone === 'string' ? body.timezone : current.timezone,
    workdayStart: typeof body.workdayStart === 'string' ? body.workdayStart : current.workdayStart,
    workdayEnd: typeof body.workdayEnd === 'string' ? body.workdayEnd : current.workdayEnd,
    workingDays: Array.isArray(body.workingDays) ? body.workingDays : current.workingDays,
  }
  const validationError = validatePolicyInput(candidate)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const next: OperatingPolicy = normalizePolicy({
    ...current,
    timezone: candidate.timezone,
    workdayStart: candidate.workdayStart,
    workdayEnd: candidate.workdayEnd,
    workingDays: candidate.workingDays,
    dailyResetTime: typeof body.dailyResetTime === 'string' ? body.dailyResetTime : current.dailyResetTime,
    warningThresholds:
      body.warningThresholds && typeof body.warningThresholds === 'object'
        ? body.warningThresholds
        : current.warningThresholds,
  })

  const startMinutes = parseClock(next.workdayStart)!
  const endMinutes = parseClock(next.workdayEnd)!

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('organization_operating_policy')
    .upsert(
      {
        organization_id: ctx.orgId,
        timezone: next.timezone,
        workday_start: formatClock(startMinutes),
        workday_end: formatClock(endMinutes),
        working_days: next.workingDays,
        daily_reset_time: next.dailyResetTime,
        warning_thresholds: next.warningThresholds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )
    .select('*')
    .single()

  if (error) {
    if (error.code === '42P01' || /does not exist|schema cache/i.test(String(error.message ?? ''))) {
      return NextResponse.json(
        { error: 'The operating-policy table is not present in this database. Apply the foundation migrations first.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  invalidateOperatingPolicy(ctx.orgId)

  return NextResponse.json({
    ok: true,
    policy: normalizePolicy({
      organizationId: ctx.orgId,
      timezone: data.timezone as string,
      workdayStart: String(data.workday_start).slice(0, 5),
      workdayEnd: String(data.workday_end).slice(0, 5),
      workingDays: data.working_days as number[],
      dailyResetTime: String(data.daily_reset_time).slice(0, 5),
      warningThresholds: data.warning_thresholds as OperatingPolicy['warningThresholds'],
      targetPack: data.target_pack as OperatingPolicy['targetPack'],
      cutoverDate: data.cutover_date as string,
    }),
  })
}
