/**
 * Lightweight provider health tracking.
 *
 * Rolling counters for success/timeout/rate-limit/latency per provider.
 * In-memory only — resets on deploy. Used for observability, not secrets.
 */

export type HealthOutcome = 'success' | 'timeout' | 'rate_limit' | 'error'

interface HealthEntry {
  success: number
  timeout: number
  rateLimit: number
  error: number
  totalLatencyMs: number
  count: number
  lastFailure: string | null
  lastFailureAt: number | null
}

const health = new Map<string, HealthEntry>()

function getEntry(provider: string): HealthEntry {
  let e = health.get(provider)
  if (!e) {
    e = { success: 0, timeout: 0, rateLimit: 0, error: 0, totalLatencyMs: 0, count: 0, lastFailure: null, lastFailureAt: null }
    health.set(provider, e)
  }
  return e
}

export function recordHealth(provider: string, outcome: HealthOutcome, latencyMs: number, failureReason?: string): void {
  const e = getEntry(provider)
  e.count += 1
  e.totalLatencyMs += latencyMs
  if (outcome === 'success') {
    e.success += 1
  } else {
    if (outcome === 'timeout') e.timeout += 1
    else if (outcome === 'rate_limit') e.rateLimit += 1
    else e.error += 1
    e.lastFailure = failureReason ?? outcome
    e.lastFailureAt = Date.now()
  }
}

export function getProviderHealth(): Array<{
  provider: string
  success: number
  timeout: number
  rateLimit: number
  error: number
  avgLatencyMs: number
  successRate: number
  lastFailure: string | null
  lastFailureAge: number | null
}> {
  const now = Date.now()
  return [...health.entries()].map(([provider, e]) => ({
    provider,
    success: e.success,
    timeout: e.timeout,
    rateLimit: e.rateLimit,
    error: e.error,
    avgLatencyMs: e.count > 0 ? Math.round(e.totalLatencyMs / e.count) : 0,
    successRate: e.count > 0 ? Math.round((e.success / e.count) * 100) : 100,
    lastFailure: e.lastFailure,
    lastFailureAge: e.lastFailureAt ? Math.round((now - e.lastFailureAt) / 1000) : null,
  }))
}

export function resetHealth(): void {
  health.clear()
}
