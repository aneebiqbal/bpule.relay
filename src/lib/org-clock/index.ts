/**
 * The canonical organization-local time authority.
 *
 * Every business date, workday fraction and "minutes remaining" in Relay comes
 * from here. Nothing in this module reads the browser timezone or the server's
 * local timezone: an IANA zone plus an instant is always supplied explicitly.
 *
 * Timestamps stay UTC in storage. Business dates are derived in the
 * organization's zone. The conversion is DST-correct: a wall-clock time is
 * resolved against the zone offset at that instant, not against a fixed offset.
 */
import { currentInstant } from './clock'
import {
  DEFAULT_POLICY,
  parseClock,
  type OperatingPolicy,
} from './policy'

export * from './policy'
export { currentInstant, setTestNow, testClockEnabled } from './clock'

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

export interface OrgInstantParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  /** 0 = Sunday … 6 = Saturday, in the organization's zone. */
  weekday: number
  /** 'YYYY-MM-DD' in the organization's zone. */
  date: string
  /** Minutes since local midnight. */
  minutesOfDay: number
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  partsFormatterCache.set(timeZone, formatter)
  return formatter
}

/** True when the IANA zone is known to the runtime. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

function partsInZone(instant: Date, timeZone: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC'
  const parts = partsFormatter(zone).formatToParts(instant)
  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function dateParts(date: string): { year: number; month: number; day: number } {
  if (!isDateString(date)) throw new Error(`Invalid business date: ${String(date)}`)
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

export function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Add whole calendar days to a business date. DST-safe: dates are calendar values. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = dateParts(date)
  const next = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY)
  return formatDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

/** Whole calendar days from `a` to `b` (b - a). */
export function diffDays(a: string, b: string): number {
  const pa = dateParts(a)
  const pb = dateParts(b)
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / MS_PER_DAY,
  )
}

/** Weekday of a calendar date. Independent of any timezone. */
export function weekdayOfDate(date: string): number {
  const { year, month, day } = dateParts(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * Offset of `timeZone` from UTC at `instant`, in milliseconds.
 * Positive east of Greenwich. Accounts for DST because it is computed from the
 * zone's rendering of that exact instant.
 */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const truncated = Math.floor(instant.getTime() / 1000) * 1000
  return asUtc - truncated
}

/**
 * Resolve a wall-clock time in a zone to the UTC instant it denotes.
 *
 * Two passes are enough for every real zone: the first guess uses the offset at
 * the naive UTC instant, the second corrects for the offset at the guess. At a
 * spring-forward gap the non-existent local time resolves to the instant just
 * after the transition; at a fall-back overlap it resolves to the first
 * occurrence. Both are deterministic, which is what the scheduler needs.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let guess = target
  for (let i = 0; i < 3; i += 1) {
    const offset = timeZoneOffsetMs(new Date(guess), timeZone)
    const next = target - offset
    if (next === guess) break
    guess = next
  }
  return new Date(guess)
}

/** The organization-local rendering of an instant. */
export function orgParts(instant: Date, timeZone: string): OrgInstantParts {
  const p = partsInZone(instant, timeZone)
  const date = formatDate(p.year, p.month, p.day)
  return {
    ...p,
    weekday: weekdayOfDate(date),
    date,
    minutesOfDay: p.hour * 60 + p.minute,
  }
}

/** 'YYYY-MM-DD' in the organization's zone. The one business-date function. */
export function orgDate(instant: Date, timeZone: string): string {
  return orgParts(instant, timeZone).date
}

/** 0 = Sunday … 6 = Saturday in the organization's zone. */
export function orgWeekday(instant: Date, timeZone: string): number {
  return orgParts(instant, timeZone).weekday
}

/** The current instant. The only place the wall clock is read. */
export function orgNow(): Date {
  return currentInstant()
}

/** The current business date for a policy. */
export function orgToday(policy: OperatingPolicy, now: Date = orgNow()): string {
  return orgDate(now, policy.timezone)
}

export interface WorkdayWindow {
  businessDate: string
  timezone: string
  start: Date
  end: Date
  startIso: string
  endIso: string
  /** Whole minutes the window spans. */
  durationMinutes: number
}

/** The workday window for a business date, resolved in the organization's zone. */
export function workdayWindow(policy: OperatingPolicy, businessDate: string): WorkdayWindow {
  const { year, month, day } = dateParts(businessDate)
  const startMinutes = parseClock(policy.workdayStart) ?? parseClock(DEFAULT_POLICY.workdayStart)!
  const endMinutes = parseClock(policy.workdayEnd) ?? parseClock(DEFAULT_POLICY.workdayEnd)!

  const start = zonedWallClockToUtc(year, month, day, Math.floor(startMinutes / 60), startMinutes % 60, policy.timezone)
  let end = zonedWallClockToUtc(year, month, day, Math.floor(endMinutes / 60), endMinutes % 60, policy.timezone)
  // Defensive: a window that crosses midnight spans into the next date.
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + MS_PER_DAY)
  }

  return {
    businessDate,
    timezone: policy.timezone,
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    durationMinutes: Math.round((end.getTime() - start.getTime()) / MS_PER_MINUTE),
  }
}

/** True when the date is a configured working day for the organization. */
export function isOrgWorkingDay(policy: OperatingPolicy, businessDate: string): boolean {
  return policy.workingDays.includes(weekdayOfDate(businessDate))
}

/**
 * Fraction of the workday elapsed, 0..1, clamped.
 * Before the window opens it is 0; after it closes it is 1.
 */
export function workdayProgress(now: Date, policy: OperatingPolicy, businessDate?: string): number {
  const date = businessDate ?? orgDate(now, policy.timezone)
  const window = workdayWindow(policy, date)
  const span = window.end.getTime() - window.start.getTime()
  if (span <= 0) return 0
  const elapsed = now.getTime() - window.start.getTime()
  if (elapsed <= 0) return 0
  if (elapsed >= span) return 1
  return elapsed / span
}

/** Whole minutes until the workday ends, floored at 0. */
export function minutesRemaining(now: Date, policy: OperatingPolicy, businessDate?: string): number {
  const date = businessDate ?? orgDate(now, policy.timezone)
  const window = workdayWindow(policy, date)
  return Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / MS_PER_MINUTE))
}

/** Whole minutes until the workday opens, floored at 0. */
export function minutesUntilWorkdayStart(now: Date, policy: OperatingPolicy, businessDate?: string): number {
  const date = businessDate ?? orgDate(now, policy.timezone)
  const window = workdayWindow(policy, date)
  return Math.max(0, Math.ceil((window.start.getTime() - now.getTime()) / MS_PER_MINUTE))
}

/** True while the instant is inside the workday window. */
export function isWithinWorkday(now: Date, policy: OperatingPolicy, businessDate?: string): boolean {
  const date = businessDate ?? orgDate(now, policy.timezone)
  const window = workdayWindow(policy, date)
  return now.getTime() >= window.start.getTime() && now.getTime() < window.end.getTime()
}

/** True once the workday has ended on that date. */
export function isAfterWorkday(now: Date, policy: OperatingPolicy, businessDate?: string): boolean {
  const date = businessDate ?? orgDate(now, policy.timezone)
  return now.getTime() >= workdayWindow(policy, date).end.getTime()
}

/** True before the workday has opened on that date. */
export function isBeforeWorkday(now: Date, policy: OperatingPolicy, businessDate?: string): boolean {
  const date = businessDate ?? orgDate(now, policy.timezone)
  return now.getTime() < workdayWindow(policy, date).start.getTime()
}

/**
 * The next operating day strictly after `fromDate`. Skips weekends, holidays
 * declared on the policy's organization are handled by the caller.
 */
export function nextOperatingDay(policy: OperatingPolicy, fromDate: string, maxLookahead = 14): string {
  let cursor = fromDate
  for (let i = 0; i < maxLookahead; i += 1) {
    cursor = addDays(cursor, 1)
    if (isOrgWorkingDay(policy, cursor)) return cursor
  }
  return cursor
}

/** The previous operating day strictly before `fromDate`. */
export function previousOperatingDay(policy: OperatingPolicy, fromDate: string, maxLookahead = 14): string {
  let cursor = fromDate
  for (let i = 0; i < maxLookahead; i += 1) {
    cursor = addDays(cursor, -1)
    if (isOrgWorkingDay(policy, cursor)) return cursor
  }
  return cursor
}

/** The UTC half-open range [start, end) that a business date covers. */
export function businessDateRange(businessDate: string, timeZone: string): { start: string; end: string } {
  const { year, month, day } = dateParts(businessDate)
  const start = zonedWallClockToUtc(year, month, day, 0, 0, timeZone)
  const next = addDays(businessDate, 1)
  const np = dateParts(next)
  const end = zonedWallClockToUtc(np.year, np.month, np.day, 0, 0, timeZone)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** '4h 21m' / '43m' / '0m' — the one duration label used by the UI. */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

/** The business date an instant belongs to, with an explicit zone. */
export function businessDateFor(instant: Date, policy: OperatingPolicy): string {
  return orgDate(instant, policy.timezone)
}

/** True when the business date is at or after the policy cutover. */
export function isAtOrAfterCutover(policy: OperatingPolicy, businessDate: string): boolean {
  return diffDays(policy.cutoverDate, businessDate) >= 0
}
