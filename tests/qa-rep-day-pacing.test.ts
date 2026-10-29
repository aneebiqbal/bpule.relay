/**
 * REP_DAY_PACING
 *
 * Pacing compares completed work to the work the clock says should be done.
 * It must not penalise an early start, must not reward a late catch-up as
 * "on time", and must treat unanswered buyer replies as mandatory work.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_WARNING_THRESHOLDS } from '@/lib/org-clock'
import { computePace } from '@/lib/rep-day/pacing'

const base = {
  mandatoryRemaining: 0,
  exceptionApproved: false,
  thresholds: DEFAULT_WARNING_THRESHOLDS,
}

describe('REP_DAY_PACING — the ratio', () => {
  it('is completed ÷ expected', () => {
    const pace = computePace({ ...base, workdayProgress: 0.5, commitmentProgress: 0.5 })
    expect(pace.paceRatio).toBeCloseTo(1, 5)
    expect(pace.band).toBe('on_pace')
    expect(pace.behindBy).toBe(0)
  })

  it('is half when a rep has done half of what the clock expects', () => {
    const pace = computePace({ ...base, workdayProgress: 0.6, commitmentProgress: 0.3 })
    expect(pace.paceRatio).toBeCloseTo(0.5, 5)
    expect(pace.behindBy).toBeCloseTo(0.3, 5)
    expect(pace.projectedCompletion).toBeCloseTo(0.5, 5)
  })

  it('does not judge before the day starts', () => {
    const pace = computePace({ ...base, workdayProgress: 0, commitmentProgress: 0 })
    expect(pace.paceRatio).toBeNull()
    expect(pace.band).toBe('not_started')
    expect(pace.onPace).toBe(true)
  })

  it('does not penalise being ahead', () => {
    const pace = computePace({ ...base, workdayProgress: 0.3, commitmentProgress: 0.7 })
    expect(pace.paceRatio!).toBeGreaterThan(1)
    expect(pace.onPace).toBe(true)
    expect(pace.behindBy).toBe(0)
  })
})

describe('REP_DAY_PACING — the bands', () => {
  it('is on pace inside the tolerance', () => {
    const pace = computePace({ ...base, workdayProgress: 0.5, commitmentProgress: 0.42 })
    expect(pace.band).toBe('on_pace')
  })

  it('is behind when materially short after the risk threshold', () => {
    const pace = computePace({ ...base, workdayProgress: 0.6, commitmentProgress: 0.3 })
    expect(pace.band).toBe('behind')
  })

  it('is not judged before the risk threshold even when nothing is done', () => {
    const pace = computePace({ ...base, workdayProgress: 0.2, commitmentProgress: 0 })
    expect(pace.band).toBe('on_pace')
  })

  it('is materially behind in the final quarter', () => {
    const pace = computePace({ ...base, workdayProgress: 0.85, commitmentProgress: 0.4 })
    expect(pace.band).toBe('materially_behind')
  })

  it('is complete when all work is done', () => {
    const pace = computePace({ ...base, workdayProgress: 0.9, commitmentProgress: 1 })
    expect(pace.band).toBe('complete')
    expect(pace.onPace).toBe(true)
  })
})

describe('REP_DAY_PACING — mandatory work and exceptions', () => {
  it('unanswered replies make an on-pace rep behind', () => {
    const pace = computePace({
      ...base,
      workdayProgress: 0.5,
      commitmentProgress: 0.5,
      mandatoryRemaining: 2,
    })
    expect(pace.band).toBe('behind')
    expect(pace.onPace).toBe(false)
  })

  it('replies before the risk threshold do not create a false alarm', () => {
    const pace = computePace({
      ...base,
      workdayProgress: 0.1,
      commitmentProgress: 0.1,
      mandatoryRemaining: 1,
    })
    expect(pace.band).toBe('on_pace')
  })

  it('an approved exception waives the pace entirely', () => {
    const pace = computePace({ ...base, workdayProgress: 0.8, commitmentProgress: 0.1, exceptionApproved: true })
    expect(pace.band).toBe('waived')
    expect(pace.onPace).toBe(true)
    expect(pace.behindBy).toBe(0)
  })
})

describe('REP_DAY_PACING — configurable thresholds', () => {
  it('honours a stricter organization policy', () => {
    const strict = {
      ...DEFAULT_WARNING_THRESHOLDS,
      riskStartPct: 10,
      riskPaceRatio: 0.95,
    }
    const pace = computePace({ ...base, thresholds: strict, workdayProgress: 0.2, commitmentProgress: 0.15 })
    expect(pace.band).toBe('behind')
  })

  it('honours a looser organization policy', () => {
    const loose = {
      ...DEFAULT_WARNING_THRESHOLDS,
      riskStartPct: 50,
      riskPaceRatio: 0.4,
    }
    const pace = computePace({ ...base, thresholds: loose, workdayProgress: 0.4, commitmentProgress: 0.2 })
    expect(pace.band).toBe('on_pace')
  })
})
