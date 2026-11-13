import { describe, expect, it } from 'vitest'
import {
  computeCoverageGaps,
  detectScheduleConflicts,
  parseClock,
  resolveCurrentOperators,
  resolveNextOperator,
  shiftCoversMinutes,
  type ScheduleInput,
} from '@/lib/schedules/model'

const TZ = 'Asia/Karachi'

function schedule(overrides: Partial<ScheduleInput> & { id: string }): ScheduleInput {
  return {
    profileId: 'profile-1',
    repId: 'rep-hassan',
    startTime: '08:00',
    endTime: '16:00',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timezone: TZ,
    effectiveFrom: '2026-01-01',
    effectiveUntil: null,
    active: true,
    ...overrides,
  }
}

// 2026-11-13 is a Friday. 16:00 Asia/Karachi = 11:00 UTC.
const FRIDAY_1559 = new Date('2026-11-13T10:59:00Z')
const FRIDAY_1600 = new Date('2026-11-13T11:00:00Z')

describe('parseClock', () => {
  it('parses wall clock and rejects malformed values', () => {
    expect(parseClock('08:00')).toBe(480)
    expect(parseClock('00:00')).toBe(0)
    expect(parseClock('23:59')).toBe(1439)
    // `pg` returns `time` columns with seconds.
    expect(parseClock('08:00:00')).toBe(480)
    expect(parseClock('16:00:00')).toBe(960)
    expect(parseClock('24:00')).toBeNull()
    expect(parseClock('8:5')).toBeNull()
    expect(parseClock(null)).toBeNull()
  })
})

describe('shiftCoversMinutes', () => {
  it('handles same-day and crossing shifts', () => {
    expect(shiftCoversMinutes(480, 960, 5, 700, 5)).toBe(true)
    expect(shiftCoversMinutes(480, 960, 5, 480, 5)).toBe(true)
    expect(shiftCoversMinutes(480, 960, 5, 960, 5)).toBe(false)
    // 22:00 → 06:00 crosses midnight
    expect(shiftCoversMinutes(1320, 360, 5, 1350, 5)).toBe(true)
    expect(shiftCoversMinutes(1320, 360, 6, 300, 5)).toBe(true)
    expect(shiftCoversMinutes(1320, 360, 6, 600, 5)).toBe(false)
  })
})

describe('resolveCurrentOperators', () => {
  it('returns the operator whose shift is open at the instant', () => {
    const rows = [
      schedule({ id: 'hassan', repId: 'rep-hassan', startTime: '08:00', endTime: '16:00' }),
      schedule({ id: 'ahmad', repId: 'rep-ahmad', startTime: '16:00', endTime: '00:00' }),
    ]
    expect(resolveCurrentOperators(rows, 'profile-1', FRIDAY_1559).map((row) => row.repId)).toEqual([
      'rep-hassan',
    ])
    expect(resolveCurrentOperators(rows, 'profile-1', FRIDAY_1600).map((row) => row.repId)).toEqual([
      'rep-ahmad',
    ])
  })

  it('supports a midnight-crossing shift', () => {
    const rows = [schedule({ id: 'night', repId: 'rep-dawood', startTime: '22:00', endTime: '06:00' })]
    // Saturday 01:00 local is inside the Friday-night shift.
    const saturdayEarly = new Date('2026-11-14T00:00:00Z') // 05:00 Fri? no: 00:00 UTC = 05:00 Fri
    void saturdayEarly
    const saturdayLocal = new Date('2026-11-13T19:00:00Z') // 00:00 Saturday local
    expect(resolveCurrentOperators(rows, 'profile-1', saturdayLocal).map((row) => row.repId)).toEqual([
      'rep-dawood',
    ])
    const saturdayMidday = new Date('2026-11-13T07:00:00Z') // 12:00 Saturday local
    expect(resolveCurrentOperators(rows, 'profile-1', saturdayMidday)).toEqual([])
  })

  it('ignores inactive, expired, and day-restricted shifts', () => {
    const rows = [
      schedule({ id: 'inactive', repId: 'rep-a', active: false }),
      schedule({ id: 'future', repId: 'rep-b', effectiveFrom: '2027-01-01' }),
      schedule({ id: 'sunday-only', repId: 'rep-c', daysOfWeek: [0] }),
    ]
    expect(resolveCurrentOperators(rows, 'profile-1', FRIDAY_1559)).toEqual([])
  })

  it('returns an empty list for a profile with no schedules', () => {
    expect(resolveCurrentOperators([], 'profile-1', FRIDAY_1559)).toEqual([])
  })
})

describe('resolveNextOperator', () => {
  it('finds the next shift later the same day', () => {
    const rows = [
      schedule({ id: 'hassan', repId: 'rep-hassan', startTime: '08:00', endTime: '16:00' }),
      schedule({ id: 'ahmad', repId: 'rep-ahmad', startTime: '16:00', endTime: '00:00' }),
    ]
    const next = resolveNextOperator(rows, 'profile-1', FRIDAY_1559)
    expect(next?.repId).toBe('rep-ahmad')
  })

  it('returns null when nothing is left today', () => {
    const rows = [schedule({ id: 'hassan', repId: 'rep-hassan', startTime: '08:00', endTime: '16:00' })]
    expect(resolveNextOperator(rows, 'profile-1', FRIDAY_1600)).toBeNull()
  })
})

describe('computeCoverageGaps', () => {
  it('reports the uncovered hours across a 24-hour day', () => {
    const rows = [
      schedule({ id: 'hassan', repId: 'rep-hassan', startTime: '08:00', endTime: '16:00' }),
      schedule({ id: 'ahmad', repId: 'rep-ahmad', startTime: '16:00', endTime: '00:00' }),
      schedule({ id: 'dawood', repId: 'rep-dawood', startTime: '00:00', endTime: '08:00' }),
    ]
    expect(computeCoverageGaps(rows, 'profile-1', '2026-11-13', { timezone: TZ })).toEqual([])
  })

  it('finds the uncovered hours around a single shift', () => {
    const rows = [schedule({ id: 'hassan', repId: 'rep-hassan', startTime: '08:00', endTime: '16:00' })]
    const gaps = computeCoverageGaps(rows, 'profile-1', '2026-11-13', { timezone: TZ })
    expect(gaps).toHaveLength(2)
    expect(gaps.reduce((sum, gap) => sum + gap.minutes, 0)).toBe(16 * 60)
  })

  it('treats a midnight-crossing shift as continuous coverage', () => {
    const rows = [
      schedule({
        id: 'night',
        repId: 'rep-dawood',
        startTime: '22:00',
        endTime: '06:00',
        daysOfWeek: [5],
      }),
    ]
    const gaps = computeCoverageGaps(rows, 'profile-1', '2026-11-13', { timezone: TZ })
    expect(gaps).toHaveLength(1)
    expect(gaps[0].minutes).toBe(22 * 60)
  })
})

describe('detectScheduleConflicts', () => {
  it('flags overlapping shifts for one rep on the same day', () => {
    const rows = [
      schedule({ id: 'a', repId: 'rep-ahmad', profileId: 'profile-1', startTime: '08:00', endTime: '16:00' }),
      schedule({ id: 'b', repId: 'rep-ahmad', profileId: 'profile-2', startTime: '14:00', endTime: '22:00' }),
    ]
    const conflicts = detectScheduleConflicts(rows)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].repId).toBe('rep-ahmad')
    expect(conflicts[0].profileIds.sort()).toEqual(['profile-1', 'profile-2'])
  })

  it('does not flag shifts on different days', () => {
    const rows = [
      schedule({ id: 'a', repId: 'rep-ahmad', profileId: 'profile-1', startTime: '08:00', endTime: '16:00', daysOfWeek: [1] }),
      schedule({ id: 'b', repId: 'rep-ahmad', profileId: 'profile-2', startTime: '14:00', endTime: '22:00', daysOfWeek: [2] }),
    ]
    expect(detectScheduleConflicts(rows)).toEqual([])
  })

  it('allows overlapping operators on different reps', () => {
    const rows = [
      schedule({ id: 'a', repId: 'rep-hassan', profileId: 'profile-1', startTime: '08:00', endTime: '16:00' }),
      schedule({ id: 'b', repId: 'rep-ahmad', profileId: 'profile-1', startTime: '14:00', endTime: '22:00' }),
    ]
    expect(detectScheduleConflicts(rows)).toEqual([])
  })
})
