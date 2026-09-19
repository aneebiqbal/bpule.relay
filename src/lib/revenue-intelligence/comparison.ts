export interface PeriodComparison<T> {
  current: T
  previous: T
  delta?: number
  deltaPercent?: number
  note?: string
}

export function comparePeriods<T extends Record<string, number>>(
  current: T,
  previous: T,
  keys: Array<keyof T>,
): Record<string, PeriodComparison<number>> {
  const result: Record<string, PeriodComparison<number>> = {}
  for (const key of keys) {
    const cur = current[key] ?? 0
    const prev = previous[key] ?? 0
    const delta = cur - prev
    let deltaPercent: number | undefined
    let note: string | undefined
    if (prev === 0 && cur === 0) {
      note = 'No activity in either period'
    } else if (prev === 0 && cur > 0) {
      note = 'New activity'
    } else if (prev > 0 && cur === 0) {
      note = 'No current activity'
    } else {
      deltaPercent = Math.round((delta / prev) * 100)
    }
    result[String(key)] = { current: cur, previous: prev, delta, ...(deltaPercent !== undefined && { deltaPercent }), ...(note && { note }) }
  }
  return result
}
