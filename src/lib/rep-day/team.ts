/**
 * Team day — the server-side contract the admin command centre reads.
 *
 * I1–I3 do not build the command-centre UI. They expose this one query so I4
 * can answer, without opening seven pages:
 *
 *   who has not started, who is active, who is behind, who is critical,
 *   who can close, who missed, how much work remains.
 *
 * Access is enforced twice: RLS on `rep_day` (own / admin / managed team) and
 * an explicit role check here. A client-supplied rep id is never trusted.
 */
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth/organization'
import { currentInstant, isOrgWorkingDay, orgDate, type OperatingPolicy } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import type { RepDayState } from './state-machine'

export interface TeamDayRow {
  repId: string
  repName: string
  state: RepDayState
  checkInAt: string | null
  closedAt: string | null
  commitmentProgress: number
  requiredRemaining: number
  minutesRemaining: number
  lateStart: boolean
  exceptionState: string
}

export interface TeamDaySummary {
  businessDate: string
  timezone: string
  isWorkingDay: boolean
  counts: Record<RepDayState, number>
  totals: {
    reps: number
    requiredRemaining: number
    commitmentProgress: number
  }
  reps: TeamDayRow[]
}

const EMPTY_COUNTS: Record<RepDayState, number> = {
  NOT_STARTED: 0,
  ACTIVE: 0,
  AT_RISK: 0,
  CRITICAL: 0,
  READY_TO_CLOSE: 0,
  CLOSED: 0,
  MISSED: 0,
}

export async function loadTeamDay(): Promise<TeamDaySummary> {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error('Unauthorized')

  const policy: OperatingPolicy = await loadOperatingPolicy(ctx.orgId)
  const now = currentInstant()
  const businessDate = orgDate(now, policy.timezone)
  const isWorkingDay = isOrgWorkingDay(policy, businessDate)

  const base: TeamDaySummary = {
    businessDate,
    timezone: policy.timezone,
    isWorkingDay,
    counts: { ...EMPTY_COUNTS },
    totals: { reps: 0, requiredRemaining: 0, commitmentProgress: 0 },
    reps: [],
  }

  if (!ctx.isAdmin && !ctx.isManager) return base

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('rep_day')
    .select('rep_id, state, check_in_at, closed_at, commitment_progress, required_remaining, minutes_remaining, exception_state')
    .eq('organization_id', ctx.orgId)
    .eq('business_date', businessDate)

  if (error) {
    // The table is optional until the migration is applied.
    if (error.code === '42P01' || /does not exist|schema cache/i.test(String(error.message ?? ''))) {
      return base
    }
    throw error
  }

  const repIds = [...new Set((data ?? []).map((row) => row.rep_id as string))]
  const { data: reps } = repIds.length
    ? await supabase.from('reps').select('id, name').in('id', repIds)
    : { data: [] }
  const nameById = new Map((reps ?? []).map((rep) => [rep.id as string, rep.name as string]))

  const workdayStart = policy.workdayStart
  const repsOut: TeamDayRow[] = []

  for (const row of data ?? []) {
    const state = (row.state as RepDayState) ?? 'NOT_STARTED'
    const checkInAt = (row.check_in_at as string) ?? null
    const lateStart =
      !checkInAt && isWorkingDay && orgDate(now, policy.timezone) === businessDate
        ? false
        : Boolean(checkInAt && checkInAt.slice(11, 16) > workdayStart)

    repsOut.push({
      repId: row.rep_id as string,
      repName: nameById.get(row.rep_id as string) ?? 'Unknown',
      state,
      checkInAt,
      closedAt: (row.closed_at as string) ?? null,
      commitmentProgress: Number(row.commitment_progress) || 0,
      requiredRemaining: (row.required_remaining as number) ?? 0,
      minutesRemaining: (row.minutes_remaining as number) ?? 0,
      lateStart,
      exceptionState: (row.exception_state as string) ?? 'NONE',
    })
  }

  const counts = { ...EMPTY_COUNTS }
  for (const rep of repsOut) counts[rep.state] += 1

  const totalProgress = repsOut.reduce((sum, rep) => sum + rep.commitmentProgress, 0)

  return {
    businessDate,
    timezone: policy.timezone,
    isWorkingDay,
    counts,
    totals: {
      reps: repsOut.length,
      requiredRemaining: repsOut.reduce((sum, rep) => sum + rep.requiredRemaining, 0),
      commitmentProgress: repsOut.length > 0 ? totalProgress / repsOut.length : 0,
    },
    reps: repsOut.sort((a, b) => a.repName.localeCompare(b.repName)),
  }
}
