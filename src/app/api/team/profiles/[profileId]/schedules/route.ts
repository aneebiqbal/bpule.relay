import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServerSupabase } from '@/lib/supabase/server'
import { listSchedulesForProfile, saveProfileSchedules } from '@/lib/schedules/load'
import { parseClock } from '@/lib/schedules/model'

export const dynamic = 'force-dynamic'

/**
 * Operator schedules for one profile.
 *
 * GET returns the active shift set. POST replaces it in one review step — the
 * admin saves the whole profile schedule at once, so a resubmit can never
 * create a second seat for the same rep.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin && !ctx.isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { profileId } = await params
  const supabase = await createServerSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const schedules = await listSchedulesForProfile(supabase, ctx.orgId, profileId)
  return NextResponse.json({ schedules })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { profileId } = await params
  const body = (await req.json().catch(() => ({}))) as { shifts?: unknown }
  const raw: unknown[] = Array.isArray(body.shifts) ? body.shifts : []

  const shifts: Array<{
    repId: string
    startTime: string
    endTime: string
    daysOfWeek: number[]
    timezone?: string
    effectiveFrom?: string
    effectiveUntil?: string | null
  }> = []
  for (const row of raw) {
    if (row === null || typeof row !== 'object') continue
    const shift = row as Record<string, unknown>
    const repId = typeof shift.repId === 'string' ? shift.repId : ''
    const startTime = typeof shift.startTime === 'string' ? shift.startTime : ''
    const endTime = typeof shift.endTime === 'string' ? shift.endTime : ''
    if (!repId || parseClock(startTime) == null || parseClock(endTime) == null) {
      return NextResponse.json({ error: 'Each shift needs repId, startTime and endTime' }, { status: 400 })
    }
    const days = Array.isArray(shift.daysOfWeek)
      ? shift.daysOfWeek.filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6)
      : []
    if (days.length === 0) {
      return NextResponse.json({ error: 'Each shift needs at least one day' }, { status: 400 })
    }
    shifts.push({
      repId,
      startTime,
      endTime,
      daysOfWeek: [...new Set(days)].sort(),
      timezone: typeof shift.timezone === 'string' ? shift.timezone : undefined,
      effectiveFrom: typeof shift.effectiveFrom === 'string' ? shift.effectiveFrom : undefined,
      effectiveUntil: typeof shift.effectiveUntil === 'string' ? shift.effectiveUntil : null,
    })
  }

  const supabase = await createServerSupabase()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const result = await saveProfileSchedules(supabase, ctx.orgId, profileId, shifts, ctx.repId)
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Save failed' }, { status: 500 })
  return NextResponse.json({ ok: true, count: shifts.length })
}
