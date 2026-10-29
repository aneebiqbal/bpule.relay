/**
 * Canonical pacing.
 *
 * Pacing answers one question: at this point in the workday, is the work done
 * where it should be? It is deliberately not "percent of end-of-day target",
 * because 40% complete is healthy at 40% of the day and alarming at 90%.
 *
 * The ratio is completed ÷ expected. Expected is the fraction of the workday
 * elapsed. A rep who has done half of what the clock says they should have done
 * is at 0.5 regardless of how large the target is.
 */
import type { WarningThresholds } from '@/lib/org-clock'

export interface PaceInput {
  /** Fraction of the workday elapsed, 0..1. */
  workdayProgress: number
  /** Fraction of the commitment completed, 0..1. */
  commitmentProgress: number
  /** Required items that are not "counted work" but still block closing. */
  mandatoryRemaining: number
  exceptionApproved: boolean
  thresholds: WarningThresholds
}

export interface PaceResult {
  /** completed ÷ expected. Null before the day starts or when work is waived. */
  paceRatio: number | null
  expectedProgress: number
  /** Where the rep finishes if today's pace holds, 0..1. */
  projectedCompletion: number | null
  onPace: boolean
  /** workdayProgress − commitmentProgress, floored at 0. */
  behindBy: number
  band: 'not_started' | 'on_pace' | 'behind' | 'materially_behind' | 'complete' | 'waived'
}

export function computePace(input: PaceInput): PaceResult {
  const expected = Math.min(1, Math.max(0, input.workdayProgress))
  const actual = Math.min(1, Math.max(0, input.commitmentProgress))
  const behindBy = Math.max(0, expected - actual)

  if (input.exceptionApproved) {
    return {
      paceRatio: 1,
      expectedProgress: expected,
      projectedCompletion: 1,
      onPace: true,
      behindBy: 0,
      band: 'waived',
    }
  }

  if (actual >= 1 && input.mandatoryRemaining === 0) {
    return {
      paceRatio: expected > 0 ? 1 / expected : null,
      expectedProgress: expected,
      projectedCompletion: 1,
      onPace: true,
      behindBy: 0,
      band: 'complete',
    }
  }

  if (expected <= 0) {
    return {
      paceRatio: null,
      expectedProgress: 0,
      projectedCompletion: null,
      onPace: true,
      behindBy: 0,
      band: 'not_started',
    }
  }

  const ratio = actual / expected
  const progressPct = expected * 100

  let band: PaceResult['band']
  if (progressPct >= input.thresholds.criticalStartPct && ratio < input.thresholds.criticalPaceRatio) {
    band = 'materially_behind'
  } else if (progressPct >= input.thresholds.riskStartPct && ratio < input.thresholds.riskPaceRatio) {
    band = 'behind'
  } else {
    band = 'on_pace'
  }

  // Unanswered buyer replies are mandatory work. A rep who is otherwise on pace
  // but is sitting on replies is behind, because that work has a customer
  // waiting on the other end of it.
  if (band === 'on_pace' && input.mandatoryRemaining > 0 && progressPct >= input.thresholds.riskStartPct) {
    band = 'behind'
  }

  return {
    paceRatio: ratio,
    expectedProgress: expected,
    projectedCompletion: Math.min(1, ratio),
    onPace: band === 'on_pace',
    behindBy,
    band,
  }
}
