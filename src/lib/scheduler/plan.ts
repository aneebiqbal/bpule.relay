/**
 * Scheduler planning — pure.
 *
 * Given an organization's policy and the current instant, decide which
 * operational jobs should exist for this business date. The result is
 * deterministic, so planning the same day twice produces the same keys and the
 * outbox's unique constraint makes the second run a no-op.
 *
 * The stage is the only time bucket. Six jobs per organization per day, not one
 * per rep and not one per hour.
 */
import {
  isOrgWorkingDay,
  workdayProgress,
  type OperatingPolicy,
  type WarningThresholds,
} from '@/lib/org-clock'

export type OperationalJobKind =
  | 'OPEN_DAY'
  | 'EVALUATE_REP_DAY'
  | 'EMIT_WARNING'
  | 'EMIT_ESCALATION'
  | 'CLOSE_MISSED_DAY'
  | 'PREPARE_CARRYOVER'
  | 'EVALUATE_FOLLOWUP'
  | 'ENQUEUE_EMAIL'

export type DayStage = 'early' | 'midday' | 'at_risk' | 'final' | 'end'

export interface PlannedJob {
  organizationId: string
  businessDate: string
  repId: string | null
  jobKind: OperationalJobKind
  timeBucket: string
  dedupeKey: string
  payload: Record<string, unknown>
}

/** Deterministic identity of a job. */
export function dedupeKeyFor(businessDate: string, jobKind: OperationalJobKind, timeBucket: string): string {
  return `${businessDate}:${jobKind}:${timeBucket}`
}

export function dayStage(progress: number, thresholds: WarningThresholds): DayStage {
  const pct = Math.min(1, Math.max(0, progress)) * 100
  if (progress >= 1) return 'end'
  if (pct >= thresholds.finalStartPct) return 'final'
  if (pct >= thresholds.criticalStartPct) return 'at_risk'
  if (pct >= thresholds.riskStartPct) return 'midday'
  return 'early'
}

export function planOperationalJobs(input: {
  policy: OperatingPolicy
  businessDate: string
  now: Date
}): PlannedJob[] {
  const { policy, businessDate, now } = input
  if (!isOrgWorkingDay(policy, businessDate)) return []

  const progress = workdayProgress(now, policy, businessDate)
  const stage = dayStage(progress, policy.warningThresholds)

  const job = (jobKind: OperationalJobKind, timeBucket: string): PlannedJob => ({
    organizationId: policy.organizationId,
    businessDate,
    repId: null,
    jobKind,
    timeBucket,
    dedupeKey: dedupeKeyFor(businessDate, jobKind, timeBucket),
    payload: { stage, progress: Number(progress.toFixed(4)) },
  })

  const jobs: PlannedJob[] = [
    job('OPEN_DAY', 'day'),
    job('EVALUATE_REP_DAY', stage),
    job('EMIT_WARNING', stage),
  ]

  // Escalation is planned from midday onward. The handler sends only for reps
  // whose derived state is CRITICAL, so planning it early is a cheap no-op —
  // and it means a rep who falls behind before 15:00 is still escalated.
  if (stage !== 'early') {
    jobs.push(job('EMIT_ESCALATION', 'critical'))
    jobs.push(job('EVALUATE_FOLLOWUP', 'midday'))
  }

  if (stage === 'end') {
    jobs.push(job('CLOSE_MISSED_DAY', 'end'))
    jobs.push(job('PREPARE_CARRYOVER', 'end'))
  }

  return jobs
}
