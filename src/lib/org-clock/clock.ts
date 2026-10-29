/**
 * The single place the wall clock is read.
 *
 * Pure functions in this package take `now` as an argument. This module exists
 * only so request handlers and loaders can obtain "now" from one place — and so
 * the browser E2E can walk a full synthetic day without waiting for it.
 *
 * The override is inert unless `RELAY_TEST_CLOCK=1` *and* the build is not a
 * production build. It is never enabled by a request header or a cookie, so a
 * production deployment cannot be time-travelled by a caller.
 */

let override: Date | null = null

export function testClockEnabled(): boolean {
  return process.env.RELAY_TEST_CLOCK === '1' && process.env.NODE_ENV !== 'production'
}

/**
 * Pin the clock to an instant. Pass `null` to return to real time.
 * Throws when the test clock is not enabled — a silent no-op here would make a
 * broken E2E look like a passing one.
 */
export function setTestNow(iso: string | null): void {
  if (!testClockEnabled()) throw new Error('Test clock is disabled')
  if (iso === null) {
    override = null
    return
  }
  const next = new Date(iso)
  if (Number.isNaN(next.getTime())) throw new Error(`Invalid instant: ${iso}`)
  override = next
}

export function currentInstant(): Date {
  return override ? new Date(override.getTime()) : new Date()
}

/** Test-only reset, so one suite cannot leak a pinned clock into the next. */
export function clearTestNow(): void {
  override = null
}
