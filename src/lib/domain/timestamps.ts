/**
 * One canonical way to turn a stored timestamp into a sortable string.
 *
 * The Neon driver returns `timestamp`/`timestamptz` columns as `Date` objects
 * while PostgREST returns ISO strings, so any sort that assumes a string
 * (`value.localeCompare`) throws on one provider or the other. Normalizing at
 * this single boundary keeps every surface interchangeable (CONVERSATION_TIMESTAMP_SORT_NON_STRING).
 */
export function toComparableTimestamp(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isNaN(ms) ? '' : value.toISOString()
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }
  return String(value)
}

/** Oldest-first comparator over values that may be Date, number, or string. */
export function compareTimestamps(a: unknown, b: unknown): number {
  return toComparableTimestamp(a).localeCompare(toComparableTimestamp(b))
}
