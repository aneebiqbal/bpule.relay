/**
 * Request-scoped memoization — client-safe core.
 *
 * React's `cache()` only memoizes inside a React render pass. Route handlers and
 * the library code they call are outside that pass, so `cache()` silently
 * stopped deduplicating: one `/api/profiles?assigned=1` request ran
 * `getCurrentUser()` seven times (14 DB reads) and `getSession()` fourteen
 * times. At ~650 ms per round trip that was the whole 30 s response.
 *
 * This module deliberately has **no server-only import** (`node:async_hooks`):
 * UI code imports modules that call `requestMemo`, and a builtin import in a
 * client chunk breaks the build. The storage is installed by
 * `request-scope.node.ts` (server-only); without it, `requestMemo` simply runs
 * the loader, so client callers are unaffected.
 */

export interface RequestScope {
  memo: Map<string, unknown>
}

export interface RequestScopeStorage {
  getStore(): RequestScope | undefined
  run<T>(store: RequestScope, fn: () => T): T
  /** Attach the scope to the calling async context (starts a request scope). */
  enterWith(store: RequestScope): void
}

let storage: RequestScopeStorage | null = null

/** Server-only entry point installs the AsyncLocalStorage backend. */
export function setRequestScopeStorage(next: RequestScopeStorage | null): void {
  storage = next
}

/** True when a request scope is active in the current async context. */
export function hasRequestScope(): boolean {
  return Boolean(storage?.getStore())
}

export function ensureRequestScope(): RequestScope {
  const active = storage?.getStore()
  if (active) return active
  const created: RequestScope = { memo: new Map() }
  storage?.enterWith(created)
  return created
}

export function requestMemo<T>(key: string, load: () => Promise<T>): Promise<T> {
  // Establishing the scope here means the first memoized call of any request
  // creates it, so no route has to remember to.
  if (!storage) return load()
  const scope = ensureRequestScope()
  const hit = scope.memo.get(key)
  if (hit !== undefined) return hit as Promise<T>
  const value = load()
  scope.memo.set(key, value)
  return value
}

/** Run work inside an isolated scope (tests, background jobs). */
export function runWithRequestScope<T>(fn: () => T): T {
  return storage?.run({ memo: new Map() }, fn) ?? fn()
}
