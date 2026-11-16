/**
 * Request-path timing probes.
 *
 * Detailed spans are off unless `RELAY_PERF_TRACE=1`, so production requests
 * pay nothing. Slow operations are always reported above
 * `RELAY_PERF_SLOW_MS` (default 1500ms) so a regression is visible without
 * turning on full tracing.
 *
 * Never log SQL text, parameters, cookies, tokens, or user data — only labels
 * and timings.
 */
const ENABLED = process.env.RELAY_PERF_TRACE === '1'
const SLOW_MS = Number(process.env.RELAY_PERF_SLOW_MS ?? 1500)

export async function perfTrace<T>(label: string, work: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T> {
  if (!ENABLED) {
    return typeof work === 'function' ? work() : work
  }
  const started = performance.now()
  try {
    return typeof work === 'function' ? await work() : await work
  } finally {
    const ms = performance.now() - started
    console.log(`[perf] ${label} ${Math.round(ms)}ms`)
    if (ms >= SLOW_MS) console.warn(`[perf][slow] ${label} ${Math.round(ms)}ms`)
  }
}

/** Log a measured span when tracing is enabled. */
export function perfLog(label: string, ms: number, detail?: string): void {
  if (!ENABLED) return
  console.log(`[perf] ${label} ${Math.round(ms)}ms${detail ? ` ${detail}` : ''}`)
}

/** Always report an operation that exceeded the slow threshold. */
export function perfSlow(label: string, ms: number, detail?: string): void {
  if (ms < SLOW_MS) return
  console.warn(`[perf][slow] ${label} ${Math.round(ms)}ms${detail ? ` ${detail}` : ''}`)
}
