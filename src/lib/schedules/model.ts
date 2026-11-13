/**
 * Operator schedules — the ONE time-aware responsibility authority.
 *
 * A schedule is a shift window on a PROFILE. It decides WHO is executable at an
 * instant; it never decides who owns the profile. Ownership stays in
 * `profile_coverage` (PRIMARY) and contribution stays in
 * `daily_accountability`.
 *
 * Pure module: every function takes an explicit instant and timezone, so the
 * same input always produces the same answer and tests need no clock.
 */
import { orgParts, zonedWallClockToUtc } from '@/lib/org-clock'

export interface ScheduleInput {
  id: string
  profileId: string
  repId: string
  /** 'HH:MM' wall clock in the organization's zone. */
  startTime: string
  /** 'HH:MM' wall clock, exclusive. May be '00:00' for end-of-day. */
  endTime: string
  /** Days the shift STARTS on: 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[]
  timezone: string
  effectiveFrom: string
  effectiveUntil: string | null
  active: boolean
}

export interface ActiveShift {
  scheduleId: string
  repId: string
  /** Resolved by the coverage engine from the rep directory; null in the pure model. */
  repName?: string | null
  startMinutes: number
  endMinutes: number
  crossesMidnight: boolean
  /** ISO instant the active window opened. */
  startsAt: string
  /** ISO instant the active window closes. */
  endsAt: string
}

export interface CoverageGap {
  /** Inclusive start, ISO. */
  start: string
  /** Exclusive end, ISO. */
  end: string
  /** Whole minutes the gap spans. */
  minutes: number
}

export interface ScheduleConflict {
  repId: string
  /** Profile ids whose shifts overlap for this rep. */
  profileIds: string[]
  /** The weekday the overlap occurs on (0 = Sunday). */
  weekday: number
  reason: string
}

const MINUTES_PER_DAY = 1440

/** 'HH:MM' → minutes since local midnight. Null when malformed. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null
  // `pg` returns `time` columns as 'HH:MM:SS'; the API sends 'HH:MM'.
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Minutes since local midnight → 'HH:MM'. */
export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(wrapped / 60)
  const rest = wrapped % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** A shift crosses midnight when its end is not after its start. */
export function shiftCrossesMidnight(startMinutes: number, endMinutes: number): boolean {
  return endMinutes <= startMinutes
}

/** Whole minutes the shift spans, always > 0. */
export function shiftDurationMinutes(startMinutes: number, endMinutes: number): number {
  return ((endMinutes - startMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/** True when a shift starting on `shiftWeekday` is active at `minutesOfDay` on `weekday`. */
export function shiftCoversMinutes(
  startMinutes: number,
  endMinutes: number,
  weekday: number,
  minutesOfDay: number,
  shiftWeekday: number,
): boolean {
  const crosses = shiftCrossesMidnight(startMinutes, endMinutes)
  if (shiftWeekday === weekday) {
    if (!crosses) return minutesOfDay >= startMinutes && minutesOfDay < endMinutes
    return minutesOfDay >= startMinutes
  }
  // Spillover: a crossing shift that started the previous day still runs.
  if (crosses && shiftWeekday === (weekday + 6) % 7) {
    return minutesOfDay < endMinutes
  }
  return false
}

function shiftInstant(
  date: string,
  minutes: number,
  timezone: string,
  dayOffset: number,
): Date {
  const [year, month, day] = date.split('-').map(Number)
  const base = zonedWallClockToUtc(year, month, day, 0, 0, timezone)
  base.setUTCDate(base.getUTCDate() + dayOffset)
  return new Date(base.getTime() + minutes * 60_000)
}

function isActiveOn(row: ScheduleInput, date: string): boolean {
  if (!row.active) return false
  if (row.effectiveFrom > date) return false
  if (row.effectiveUntil && row.effectiveUntil < date) return false
  return true
}

/**
 * THE canonical resolver. Every operator whose shift is open at `at`, for one
 * profile. Ownership is not consulted here — callers combine this with the
 * coverage plan so a PRIMARY with no shift is not reported as working.
 */
export function resolveCurrentOperators(
  schedules: readonly ScheduleInput[],
  profileId: string,
  at: Date,
): ActiveShift[] {
  const row = schedules.find((schedule) => schedule.timezone) ?? schedules[0]
  const timezone = row?.timezone ?? 'UTC'
  const parts = orgParts(at, timezone)
  const date = parts.date
  const weekday = parts.weekday
  const minutesOfDay = parts.minutesOfDay

  const out: ActiveShift[] = []
  for (const schedule of schedules) {
    if (schedule.profileId !== profileId) continue
    if (!isActiveOn(schedule, date)) continue
    const start = parseClock(schedule.startTime)
    const end = parseClock(schedule.endTime)
    if (start == null || end == null) continue
    const days = schedule.daysOfWeek.length > 0 ? schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]
    // The shift may have opened today, or be spilling over from yesterday when
    // it crosses midnight. Check both start days.
    const matchingDay = [weekday, (weekday + 6) % 7].find(
      (day) => days.includes(day) && shiftCoversMinutes(start, end, weekday, minutesOfDay, day),
    )
    if (matchingDay === undefined) continue
    const crosses = shiftCrossesMidnight(start, end)
    const startedToday = matchingDay === weekday && minutesOfDay >= start
    const startInstant = startedToday
      ? shiftInstant(date, start, timezone, 0)
      : shiftInstant(date, start, timezone, -1)
    const duration = shiftDurationMinutes(start, end)
    out.push({
      scheduleId: schedule.id,
      repId: schedule.repId,
      startMinutes: start,
      endMinutes: end,
      crossesMidnight: crosses,
      startsAt: startInstant.toISOString(),
      endsAt: new Date(startInstant.getTime() + duration * 60_000).toISOString(),
    })
  }
  return out.sort((a, b) => a.startMinutes - b.startMinutes)
}

/** The next shift to open for a profile, after `at`. Null when none is scheduled. */
export function resolveNextOperator(
  schedules: readonly ScheduleInput[],
  profileId: string,
  at: Date,
): ActiveShift | null {
  const row = schedules.find((schedule) => schedule.timezone) ?? schedules[0]
  const timezone = row?.timezone ?? 'UTC'
  const parts = orgParts(at, timezone)
  const date = parts.date
  const weekday = parts.weekday
  const minutesOfDay = parts.minutesOfDay

  let best: { shift: ActiveShift; startsAtMs: number } | null = null
  for (const schedule of schedules) {
    if (schedule.profileId !== profileId) continue
    if (!isActiveOn(schedule, date)) continue
    const start = parseClock(schedule.startTime)
    if (start == null) continue
    const days = schedule.daysOfWeek.length > 0 ? schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]
    // Only a shift starting later today (or tomorrow, when nothing is left today)
    // counts as "next" — a shift already running is the current operator.
    if (!days.includes(weekday) || start <= minutesOfDay) continue
    const startsAtMs = shiftInstant(date, start, timezone, 0).getTime()
    if (!best || startsAtMs < best.startsAtMs) {
      const end = parseClock(schedule.endTime) ?? start
      best = {
        startsAtMs,
        shift: {
          scheduleId: schedule.id,
          repId: schedule.repId,
          startMinutes: start,
          endMinutes: end,
          crossesMidnight: shiftCrossesMidnight(start, end),
          startsAt: new Date(startsAtMs).toISOString(),
          endsAt: new Date(startsAtMs + shiftDurationMinutes(start, end) * 60_000).toISOString(),
        },
      }
    }
  }
  return best?.shift ?? null
}

/**
 * Expand every active shift into concrete UTC intervals over the business date,
 * then return the uncovered complement. Used for the 24-hour coverage gate.
 */
export function computeCoverageGaps(
  schedules: readonly ScheduleInput[],
  profileId: string,
  businessDate: string,
  options: { timezone?: string; requireFullDay?: boolean } = {},
): CoverageGap[] {
  const row = schedules.find((schedule) => schedule.timezone) ?? schedules[0]
  const timezone = options.timezone ?? row?.timezone ?? 'UTC'
  const [year, month, day] = businessDate.split('-').map(Number)
  const dayStart = zonedWallClockToUtc(year, month, day, 0, 0, timezone)
  const dayEnd = new Date(dayStart.getTime() + MINUTES_PER_DAY * 60_000)

  const intervals: Array<{ start: number; end: number }> = []
  for (const schedule of schedules) {
    if (schedule.profileId !== profileId) continue
    if (!isActiveOn(schedule, businessDate)) continue
    const start = parseClock(schedule.startTime)
    const end = parseClock(schedule.endTime)
    if (start == null || end == null) continue
    const days = schedule.daysOfWeek.length > 0 ? schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]
    const duration = shiftDurationMinutes(start, end)

    // A shift can open on the business date, or spill over from the previous
    // date when it crosses midnight.
    for (const offset of [0, -1]) {
      const open = shiftInstant(businessDate, start, timezone, offset)
      const openWeekday = Number(orgParts(open, timezone).weekday)
      if (!days.includes(openWeekday)) continue
      const close = new Date(open.getTime() + duration * 60_000)
      const clippedStart = Math.max(open.getTime(), dayStart.getTime())
      const clippedEnd = Math.min(close.getTime(), dayEnd.getTime())
      if (clippedEnd > clippedStart) intervals.push({ start: clippedStart, end: clippedEnd })
    }
  }

  intervals.sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const interval of intervals) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }

  const gaps: CoverageGap[] = []
  let cursor = dayStart.getTime()
  for (const interval of merged) {
    if (interval.start > cursor) {
      gaps.push({
        start: new Date(cursor).toISOString(),
        end: new Date(interval.start).toISOString(),
        minutes: Math.round((interval.start - cursor) / 60_000),
      })
    }
    cursor = Math.max(cursor, interval.end)
  }
  if (cursor < dayEnd.getTime()) {
    gaps.push({
      start: new Date(cursor).toISOString(),
      end: dayEnd.toISOString(),
      minutes: Math.round((dayEnd.getTime() - cursor) / 60_000),
    })
  }
  return gaps
}

/**
 * Warn (never block) when one rep holds overlapping shifts. Overlap is
 * evaluated per weekday, so two profiles on different days never conflict.
 */
export function detectScheduleConflicts(
  schedules: readonly ScheduleInput[],
): ScheduleConflict[] {
  const byRep = new Map<string, ScheduleInput[]>()
  for (const schedule of schedules) {
    if (!schedule.active) continue
    const list = byRep.get(schedule.repId) ?? []
    list.push(schedule)
    byRep.set(schedule.repId, list)
  }

  const seen = new Set<string>()
  const conflicts: ScheduleConflict[] = []
  for (const [repId, rows] of byRep) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const spans = rows.flatMap((row) => {
        const start = parseClock(row.startTime)
        const end = parseClock(row.endTime)
        if (start == null || end == null) return []
        const days = row.daysOfWeek.length > 0 ? row.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]
        const crosses = shiftCrossesMidnight(start, end)
        const opensHere = days.includes(weekday)
        const spillsHere = crosses && days.includes((weekday + 6) % 7)
        if (!opensHere && !spillsHere) return []
        const from = opensHere ? start : 0
        const to = opensHere ? (crosses ? MINUTES_PER_DAY : end) : end
        return [{ profileId: row.profileId, from, to }]
      })
      for (let i = 0; i < spans.length; i += 1) {
        for (let j = i + 1; j < spans.length; j += 1) {
          const a = spans[i]
          const b = spans[j]
          if (a.profileId === b.profileId) continue
          if (a.from < b.to && b.from < a.to) {
            // The same pair can overlap on several weekdays; report it once.
            const key = `${repId}|${[a.profileId, b.profileId].sort().join('|')}`
            if (seen.has(key)) continue
            seen.add(key)
            conflicts.push({
              repId,
              profileIds: [a.profileId, b.profileId],
              weekday,
              reason: `Overlapping shifts on ${weekday}`,
            })
          }
        }
      }
    }
  }
  return conflicts
}
