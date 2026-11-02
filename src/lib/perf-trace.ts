/**
 * Request-path timing probe for the dashboard loaders.
 *
 * Off unless `RELAY_PERF_TRACE=1`, so production requests pay nothing. Used to
 * attribute cold/warm latency to individual data loads before optimizing.
 */
const ENABLED = process.env.RELAY_PERF_TRACE === '1'

export async function perfTrace<T>(label: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
  if (!ENABLED) {
    return typeof work === 'function' ? work() : work
  }
  const started = performance.now()
  try {
    return typeof work === 'function' ? await work() : await work
  } finally {
    console.log(`[perf] ${label} ${Math.round(performance.now() - started)}ms`)
  }
}
