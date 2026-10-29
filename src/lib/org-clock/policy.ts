/**
 * Organization operating policy — the shape of an organization's clock.
 *
 * Pure data and parsing only. No database, no `Date.now()`. Everything that
 * needs "now" takes it as an argument, so the whole clock is testable and the
 * browser's timezone can never leak into accountability.
 */

/** 0 = Sunday … 6 = Saturday, matching Postgres `extract(dow)`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface WarningThresholds {
  /** Fraction of the workday after which pace is evaluated. */
  riskStartPct: number
  /** completed/expected below this is AT_RISK. */
  riskPaceRatio: number
  /** Fraction of the workday after which a bigger miss is CRITICAL. */
  criticalStartPct: number
  /** completed/expected below this (after criticalStart) is CRITICAL. */
  criticalPaceRatio: number
  /** Fraction of the workday after which "final" warnings fire. */
  finalStartPct: number
}

export interface TargetPackEntry {
  key: string
  label: string
  target: number
  unit: 'count' | 'percent'
}

export interface OperatingPolicy {
  organizationId: string
  timezone: string
  /** 'HH:MM' 24-hour, organization-local. */
  workdayStart: string
  /** 'HH:MM' 24-hour, organization-local. */
  workdayEnd: string
  workingDays: number[]
  /** 'HH:MM' 24-hour, organization-local. */
  dailyResetTime: string
  warningThresholds: WarningThresholds
  targetPack: TargetPackEntry[]
  /** First business date the organization-local boundary is authoritative. */
  cutoverDate: string
}

export const DEFAULT_WARNING_THRESHOLDS: WarningThresholds = {
  riskStartPct: 25,
  riskPaceRatio: 0.8,
  criticalStartPct: 75,
  criticalPaceRatio: 0.6,
  finalStartPct: 90,
}

export const DEFAULT_POLICY: OperatingPolicy = {
  organizationId: '',
  timezone: 'UTC',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
  dailyResetTime: '00:00',
  warningThresholds: DEFAULT_WARNING_THRESHOLDS,
  targetPack: [],
  cutoverDate: '1970-01-01',
}

/** '09:30' → 570. Returns null for anything that is not a valid clock time. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

/** 570 → '09:30'. */
export function formatClock(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes)))
  const hours = Math.floor(safe / 60) % 24
  const mins = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function clampFraction(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

/** A percentage (0–100), not a fraction. */
function percent(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

function normalizeThresholds(raw: unknown): WarningThresholds {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    riskStartPct: percent(input.riskStartPct, DEFAULT_WARNING_THRESHOLDS.riskStartPct),
    riskPaceRatio: clampFraction(input.riskPaceRatio, DEFAULT_WARNING_THRESHOLDS.riskPaceRatio),
    criticalStartPct: percent(input.criticalStartPct, DEFAULT_WARNING_THRESHOLDS.criticalStartPct),
    criticalPaceRatio: clampFraction(input.criticalPaceRatio, DEFAULT_WARNING_THRESHOLDS.criticalPaceRatio),
    finalStartPct: percent(input.finalStartPct, DEFAULT_WARNING_THRESHOLDS.finalStartPct),
  }
}

function normalizePack(raw: unknown): TargetPackEntry[] {
  if (!Array.isArray(raw)) return []
  const out: TargetPackEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    if (typeof row.key !== 'string' || !row.key) continue
    const target = Number(row.target)
    if (!Number.isFinite(target) || target < 0) continue
    out.push({
      key: row.key,
      label: typeof row.label === 'string' && row.label ? row.label : row.key,
      target,
      unit: row.unit === 'percent' ? 'percent' : 'count',
    })
  }
  return out
}

/** Coerce a database row (or partial config) into a complete policy. */
export function normalizePolicy(input: Partial<OperatingPolicy> & { organizationId?: string }): OperatingPolicy {
  const start = parseClock(input.workdayStart) ?? parseClock(DEFAULT_POLICY.workdayStart)!
  const end = parseClock(input.workdayEnd) ?? parseClock(DEFAULT_POLICY.workdayEnd)!
  const workingDays = Array.isArray(input.workingDays)
    ? input.workingDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : DEFAULT_POLICY.workingDays

  return {
    organizationId: input.organizationId ?? DEFAULT_POLICY.organizationId,
    timezone: typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_POLICY.timezone,
    // A reversed window is a configuration error, not a zero-length day.
    workdayStart: formatClock(Math.min(start, end - 1)),
    workdayEnd: formatClock(Math.max(end, start + 1)),
    workingDays: workingDays.length > 0 ? [...new Set(workingDays)].sort() : DEFAULT_POLICY.workingDays,
    dailyResetTime: formatClock(parseClock(input.dailyResetTime) ?? 0),
    warningThresholds: normalizeThresholds(input.warningThresholds),
    targetPack: normalizePack(input.targetPack),
    cutoverDate: typeof input.cutoverDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.cutoverDate)
      ? input.cutoverDate
      : DEFAULT_POLICY.cutoverDate,
  }
}

/** Convert the Postgres `time` column ('09:00:00') to the policy shape. */
export function timeColumnToClock(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const minutes = parseClock(value)
  return minutes === null ? undefined : formatClock(minutes)
}
