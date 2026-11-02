import type { DbClient } from '@/lib/db/types'
/**
 * Loader instrumentation (Phase 8 / Slice C). Off by default; enable with
 * RELAY_PERF_LOG=1 to emit one JSON line per measured loader:
 *
 *   {"relay_perf":"chats.queue","ms":84,"queries":4,"bytes":18233}
 *
 * `queries` counts `.from()` / `.rpc()` calls made through the instrumented
 * client during the loader; `bytes` is the serialized size of the result.
 * These are measurements for the activation run — no PASS is recorded here.
 */

export function perfLoggingEnabled(): boolean {
  return process.env.RELAY_PERF_LOG === '1'
}

export interface QueryCounter {
  count: number
}

/** Wrap a Supabase client so `.from()` and `.rpc()` calls increment `counter`. */
export function instrumentClient(client: DbClient, counter: QueryCounter): DbClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if ((prop === 'from' || prop === 'rpc') && typeof value === 'function') {
        return (...args: unknown[]) => {
          counter.count += 1
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return value
    },
  })
}

export function payloadBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? '').length
  } catch {
    return -1
  }
}

export interface LoaderMeasurement {
  name: string
  ms: number
  queries: number | null
  bytes: number
}

/**
 * Measure a loader. When logging is off this is a pass-through (no counting,
 * no serialization cost).
 */
export async function measureLoader<T>(
  name: string,
  run: (client?: DbClient) => Promise<T>,
  client?: DbClient,
  sink: (m: LoaderMeasurement) => void = (m) => console.info(JSON.stringify({ relay_perf: m.name, ms: m.ms, queries: m.queries, bytes: m.bytes })),
): Promise<T> {
  if (!perfLoggingEnabled()) return run(client)
  const counter: QueryCounter = { count: 0 }
  const instrumented = client ? instrumentClient(client, counter) : undefined
  const started = performance.now()
  const result = await run(instrumented)
  sink({
    name,
    ms: Math.round(performance.now() - started),
    queries: client ? counter.count : null,
    bytes: payloadBytes(result),
  })
  return result
}
