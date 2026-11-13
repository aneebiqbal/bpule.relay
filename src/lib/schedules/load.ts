import type { DbClient } from '@/lib/db/types'
import type { ScheduleInput } from './model'

/**
 * Schedule persistence. The admin editor saves a whole shift set for a profile
 * in one review step, so saving replaces that rep's active rows rather than
 * appending — a resubmit can never create a second seat.
 */

const COLUMNS =
  'id, profile_id, rep_id, start_time, end_time, days_of_week, timezone, effective_from, effective_until, active'

interface ScheduleRow {
  id: string
  profile_id: string
  rep_id: string
  start_time: string
  end_time: string
  days_of_week: number[]
  timezone: string
  effective_from: string
  effective_until: string | null
  active: boolean
}

function toSchedule(row: ScheduleRow): ScheduleInput {
  return {
    id: row.id,
    profileId: row.profile_id,
    repId: row.rep_id,
    startTime: row.start_time,
    endTime: row.end_time,
    daysOfWeek: Array.isArray(row.days_of_week) ? row.days_of_week : [0, 1, 2, 3, 4, 5, 6],
    timezone: row.timezone,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    active: row.active,
  }
}

export async function listSchedulesForProfile(
  client: DbClient,
  orgId: string,
  profileId: string,
): Promise<ScheduleInput[]> {
  const { data, error } = await client
    .from('responsibility_schedules')
    .select(COLUMNS)
    .eq('organization_id', orgId)
    .eq('profile_id', profileId)
    .eq('active', true)
    .limit(200)
  if (error) throw error
  return ((data ?? []) as ScheduleRow[]).map(toSchedule)
}

export async function listSchedulesForOrg(
  client: DbClient,
  orgId: string,
): Promise<ScheduleInput[]> {
  const { data, error } = await client
    .from('responsibility_schedules')
    .select(COLUMNS)
    .eq('organization_id', orgId)
    .eq('active', true)
    .limit(4000)
  if (error) throw error
  return ((data ?? []) as ScheduleRow[]).map(toSchedule)
}

export interface ShiftInput {
  repId: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
  timezone?: string
  effectiveFrom?: string
  effectiveUntil?: string | null
}

/**
 * Replace the active shift set for a profile. Existing rows are deactivated,
 * not deleted, so the audit trail survives a schedule edit.
 */
export async function saveProfileSchedules(
  client: DbClient,
  orgId: string,
  profileId: string,
  shifts: ShiftInput[],
  actorRepId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error: deactivateError } = await client
    .from('responsibility_schedules')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('profile_id', profileId)
    .eq('active', true)
  if (deactivateError) return { ok: false, error: deactivateError.message }

  if (shifts.length === 0) return { ok: true }

  const rows = shifts.map((shift) => ({
    organization_id: orgId,
    profile_id: profileId,
    rep_id: shift.repId,
    start_time: shift.startTime,
    end_time: shift.endTime,
    days_of_week: shift.daysOfWeek,
    timezone: shift.timezone ?? 'UTC',
    effective_from: shift.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effective_until: shift.effectiveUntil ?? null,
    active: true,
    created_by: actorRepId,
  }))

  const { error: insertError } = await client.from('responsibility_schedules').insert(rows)
  if (insertError) return { ok: false, error: insertError.message }
  return { ok: true }
}
