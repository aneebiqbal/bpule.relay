/**
 * URL state for operational surfaces (Phase 8.39). Filters live in the query
 * string so they survive refresh and the back button. Parsing is pure and
 * defensive: unknown values fall back to defaults, never throw.
 */

export type OpsRange = 'today' | '7d' | '30d' | '90d'

export const OPS_RANGES: Array<{ value: OpsRange; label: string; days: number }> = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
]

export type OpsSource = 'linkedin' | 'upwork' | 'other'

export interface OpsFilters {
  team: string | null
  rep: string | null
  profile: string | null
  source: OpsSource | null
  event: string | null
  range: OpsRange
  view: string | null
  group: string | null
  tab: string | null
  q: string | null
}

type Params = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  const trimmed = raw?.trim()
  return trimmed ? trimmed.slice(0, 120) : null
}

const UUIDISH = /^[0-9a-f-]{8,64}$/i

function idParam(value: string | string[] | undefined): string | null {
  const raw = first(value)
  return raw && UUIDISH.test(raw) ? raw : null
}

export function parseOpsFilters(params: Params, defaults?: Partial<Pick<OpsFilters, 'range'>>): OpsFilters {
  const range = first(params.range)
  const source = first(params.source)
  return {
    team: idParam(params.team),
    rep: idParam(params.rep),
    profile: idParam(params.profile),
    source: source === 'linkedin' || source === 'upwork' || source === 'other' ? source : null,
    event: first(params.event),
    range: OPS_RANGES.some((r) => r.value === range) ? (range as OpsRange) : (defaults?.range ?? '7d'),
    view: first(params.view),
    group: first(params.group),
    tab: first(params.tab),
    q: first(params.q),
  }
}

/** Range → [start, end) ISO instants. `today` is the last 24h window ending now. */
export function rangeWindow(range: OpsRange, now: Date = new Date()): { start: string; end: string; days: number } {
  const days = OPS_RANGES.find((r) => r.value === range)?.days ?? 7
  // Minute precision so every loader in one request shares the same window.
  const minute = Math.floor(now.getTime() / 60_000) * 60_000
  const end = new Date(minute + 60_000)
  const start = new Date(minute)
  if (range === 'today') {
    start.setUTCHours(0, 0, 0, 0)
  } else {
    start.setUTCDate(start.getUTCDate() - days)
  }
  return { start: start.toISOString(), end: end.toISOString(), days }
}

/**
 * Build an href that keeps the current filters and applies `patch`.
 * A null / empty patch value removes the key. Page resets when filters change.
 */
export function opsHref(
  basePath: string,
  current: Record<string, string | null | undefined>,
  patch: Record<string, string | null | undefined> = {},
): string {
  const merged: Record<string, string | null | undefined> = { ...current, ...patch }
  // Paging resets when a filter changes; opening a record (`lead`) keeps it.
  const resetsPage = Object.keys(patch).some((key) => key !== 'page' && key !== 'lead')
  if (resetsPage) delete merged.page
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined || value === '') continue
    qs.set(key, value)
  }
  const s = qs.toString()
  return s ? `${basePath}?${s}` : basePath
}

/** Plain record of the filters, for `opsHref` / saved views. */
export function filtersToRecord(filters: OpsFilters): Record<string, string | null> {
  return {
    team: filters.team,
    rep: filters.rep,
    profile: filters.profile,
    source: filters.source,
    event: filters.event,
    range: filters.range,
    view: filters.view,
    group: filters.group,
    tab: filters.tab,
    q: filters.q,
  }
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  upwork: 'Upwork',
  email: 'Email',
  referral: 'Referral',
  other: 'Imported',
}

/**
 * Canonical display label for a lead's stored source. Unknown or missing means
 * the origin cannot be proven, so it says so — never "Other" or a guess.
 */
export function sourceLabel(source: string | null | undefined): string {
  const s = (source ?? '').trim().toLowerCase()
  if (!s) return 'Source not recorded'
  return SOURCE_LABELS[s] ?? 'Source not recorded'
}

/** Lead source → comparison bucket. Never guesses: unknown is `other`. */
export function sourceBucket(source: string | null | undefined): OpsSource {
  const s = (source ?? '').toLowerCase()
  if (s === 'linkedin') return 'linkedin'
  if (s === 'upwork') return 'upwork'
  return 'other'
}
