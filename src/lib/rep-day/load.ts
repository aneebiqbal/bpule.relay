/**
 * The canonical Today loader.
 *
 * One call returns everything the rep's day needs: the state, the pace, the
 * seven commitments, the time remaining, the exception and the shortfall.
 * `/dashboard`, `/api/rep/today`, `/api/rep/my-day` and the scheduler all read
 * this, so they cannot disagree.
 *
 * It does not add a query waterfall: the workspace (identities, targets,
 * accountability, replies) is already a single cached load, and the only extra
 * read is the rep's own day row.
 */
import { getDailyWorkspace } from '@/lib/auth/workspace'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  currentInstant,
  formatDuration,
  orgParts,
  type OperatingPolicy,
} from '@/lib/org-clock'
import { buildCommitments, type CommitmentRow } from './commitments'
import { deriveRepDayState, type RepDayState, type RepDayReason } from './state-machine'

export type ExceptionState = 'NONE' | 'REQUESTED' | 'APPROVED' | 'REJECTED'

export interface RepDayException {
  state: ExceptionState
  reason: string | null
  note: string | null
  reviewedBy: string | null
  reviewedAt: string | null
}

export interface RepDayView {
  repId: string
  repName: string
  organizationId: string
  businessDate: string
  timezone: string
  /** Organization-local hour, 0–23. Used for the greeting, never for logic. */
  localHour: number
  isWorkingDay: boolean
  applicable: boolean
  state: RepDayState
  reason: RepDayReason
  checkInAt: string | null
  closedAt: string | null
  workdayProgress: number
  commitmentProgress: number
  paceRatio: number | null
  minutesRemaining: number
  minutesRemainingLabel: string
  requiredRemaining: number
  /** Outstanding buyer replies: mandatory work regardless of target. */
  mandatoryRemaining: number
  commitments: CommitmentRow[]
  exception: RepDayException
  shortfall: Record<string, unknown>
  carryover: Record<string, unknown>
  /** False when the `rep_day` table is absent — Today still works, unpersisted. */
  persisted: boolean
  policy: OperatingPolicy
}

interface RepDayRow {
  check_in_at: string | null
  closed_at: string | null
  exception_state: ExceptionState | null
  exception_reason: string | null
  exception_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  shortfall: Record<string, unknown> | null
  carryover: Record<string, unknown> | null
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return /does not exist|schema cache/i.test(String(error.message ?? ''))
}

const EMPTY_EXCEPTION: RepDayException = {
  state: 'NONE',
  reason: null,
  note: null,
  reviewedBy: null,
  reviewedAt: null,
}

export async function loadRepDay(): Promise<RepDayView> {
  const workspace = await getDailyWorkspace()
  const policy = workspace.policy
  const now = currentInstant()
  const businessDate = workspace.businessDate

  const targets = workspace.targetSummary.byIdentity.flatMap((identity) =>
    identity.targets.map((target) => ({
      activityType: target.activityType,
      targetCount: target.targetCount,
      completedCount: target.completedCount,
    })),
  )

  const commitments = buildCommitments({
    targets,
    repliesWaiting: workspace.day.repliesWaiting,
    targetPack: policy.targetPack,
  })

  const supabase = await createServerSupabase()
  let row: RepDayRow | null = null
  let persisted = true

  const { data, error } = await supabase
    .from('rep_day')
    .select('check_in_at, closed_at, exception_state, exception_reason, exception_note, reviewed_by, reviewed_at, shortfall, carryover')
    .eq('organization_id', workspace.orgId ?? '')
    .eq('rep_id', workspace.rep.id)
    .eq('business_date', businessDate)
    .maybeSingle()

  if (error) {
    if (!isMissingRelation(error)) throw error
    persisted = false
  } else if (data) {
    row = data as RepDayRow
  }

  const exception: RepDayException = row
    ? {
        state: row.exception_state ?? 'NONE',
        reason: row.exception_reason,
        note: row.exception_note,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
      }
    : EMPTY_EXCEPTION

  const derived = deriveRepDayState({
    policy,
    businessDate,
    now,
    isWorkingDay: workspace.isWorkingDay,
    checkInAt: row?.check_in_at ?? null,
    closedAt: row?.closed_at ?? null,
    commitmentProgress: commitments.progress,
    requiredRemaining: commitments.requiredRemaining,
    mandatoryRemaining: commitments.mandatoryRemaining,
    exceptionApproved: exception.state === 'APPROVED',
  })

  if (persisted) {
    // Best-effort refresh of the derived columns. Never touches check-in,
    // close, exception or shortfall — those are explicit transitions.
    await refreshDerived(workspace.orgId, workspace.rep.id, businessDate, {
      state: derived.state,
      workdayProgress: derived.workdayProgress,
      commitmentProgress: commitments.progress,
      paceRatio: derived.paceRatio,
      minutesRemaining: derived.minutesRemaining,
      requiredRemaining: commitments.requiredRemaining,
    }).catch(() => {
      // A refresh failure must never break the rep's Today.
    })
  }

  return {
    repId: workspace.rep.id,
    repName: workspace.rep.name,
    organizationId: workspace.orgId,
    businessDate,
    timezone: policy.timezone,
    localHour: orgParts(now, policy.timezone).hour,
    isWorkingDay: workspace.isWorkingDay,
    applicable: derived.applicable,
    state: derived.state,
    reason: derived.reason,
    checkInAt: row?.check_in_at ?? null,
    closedAt: row?.closed_at ?? null,
    workdayProgress: derived.workdayProgress,
    commitmentProgress: commitments.progress,
    paceRatio: derived.paceRatio,
    minutesRemaining: derived.minutesRemaining,
    minutesRemainingLabel: formatDuration(derived.minutesRemaining),
    requiredRemaining: commitments.requiredRemaining,
    mandatoryRemaining: commitments.mandatoryRemaining,
    commitments: commitments.rows,
    exception,
    shortfall: row?.shortfall ?? {},
    carryover: row?.carryover ?? {},
    persisted,
    policy,
  }
}

async function refreshDerived(
  organizationId: string,
  repId: string,
  businessDate: string,
  values: {
    state: RepDayState
    workdayProgress: number
    commitmentProgress: number
    paceRatio: number | null
    minutesRemaining: number
    requiredRemaining: number
  },
): Promise<void> {
  if (!organizationId) return
  const supabase = await createServerSupabase()
  const payload = {
    organization_id: organizationId,
    rep_id: repId,
    business_date: businessDate,
    state: values.state,
    workday_progress: Number(values.workdayProgress.toFixed(4)),
    commitment_progress: Number(values.commitmentProgress.toFixed(4)),
    pace_ratio: values.paceRatio === null ? null : Number(values.paceRatio.toFixed(3)),
    minutes_remaining: values.minutesRemaining,
    required_remaining: values.requiredRemaining,
    updated_at: new Date().toISOString(),
  }

  // Upsert touches only the derived columns: check-in, close, exception and
  // shortfall are explicit transitions and are never overwritten by a refresh.
  const { error } = await supabase
    .from('rep_day')
    .upsert(payload, { onConflict: 'organization_id,rep_id,business_date' })

  if (error && !isMissingRelation(error)) throw error
}
