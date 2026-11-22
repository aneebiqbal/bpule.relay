/**
 * The single place the wall clock is read.
 *
 * Pure functions in this package take `now` as an argument. This module exists
 * only so request handlers and loaders can obtain "now" from one place — and so
 * the browser E2E can walk a full synthetic day without waiting for it.
 *
 * The override lives on `globalThis`, not in a module variable, because Next
 * bundles route handlers and server components into separate module graphs: a
 * module-level variable would only be visible to the bundle that set it.
 *
 * The override is inert unless `RELAY_TEST_CLOCK=1` *and* the build is not a
 * production build. It is never enabled by a request header or a cookie, so a
 * production deployment cannot be time-travelled by a caller.
 */

const KEY = '__RELAY_TEST_NOW__'

function slot(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>
}

/**
 * Inert unless `RELAY_TEST_CLOCK=1` *and* the build is not a production build.
 * A production build additionally requires the explicit
 * `RELAY_TEST_CLOCK_IN_PRODUCTION=1` opt-in, so a deployed environment cannot be
 * time-travelled unless an operator deliberately enables it.
 */
export function testClockEnabled(): boolean {
  if (process.env.RELAY_TEST_CLOCK !== '1') return false
  if (process.env.NODE_ENV !== 'production') return true
  return process.env.RELAY_TEST_CLOCK_IN_PRODUCTION === '1'
}

/**
 * Pin the clock to an instant. Pass `null` to return to real time.
 * Throws when the test clock is not enabled — a silent no-op here would make a
 * broken E2E look like a passing one.
 */
export function setTestNow(iso: string | null): void {
  if (!testClockEnabled()) throw new Error('Test clock is disabled')
  if (iso === null) {
    delete slot()[KEY]
    return
  }
  const next = new Date(iso)
  if (Number.isNaN(next.getTime())) throw new Error(`Invalid instant: ${iso}`)
  slot()[KEY] = next.toISOString()
}

export function currentInstant(): Date {
  if (testClockEnabled()) {
    const iso = slot()[KEY]
    if (typeof iso === 'string' && iso) return new Date(iso)
  }
  return new Date()
}

/** Test-only reset, so one suite cannot leak a pinned clock into the next. */
export function clearTestNow(): void {
  delete slot()[KEY]
}
