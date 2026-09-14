/**
 * In-flight request deduplication.
 *
 * Prevents double-click/refresh/concurrent requests from causing duplicate
 * expensive generations. Same user + same normalized input + same operation
 * within a window reuses in-flight/completed work.
 */

interface InFlightEntry<T> {
  promise: Promise<T>
  createdAt: number
}

const inFlightRequests = new Map<string, InFlightEntry<unknown>>()
const DEDUP_WINDOW_MS = 30_000

export async function deduplicated<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlightRequests.get(key)
  if (existing && Date.now() - existing.createdAt < DEDUP_WINDOW_MS) {
    return existing.promise as Promise<T>
  }

  const promise = fn().finally(() => {
    const current = inFlightRequests.get(key)
    if (current && current.promise === promise) {
      inFlightRequests.delete(key)
    }
  })

  inFlightRequests.set(key, { promise, createdAt: Date.now() })
  return promise
}

export function clearDedup(): void {
  inFlightRequests.clear()
}
