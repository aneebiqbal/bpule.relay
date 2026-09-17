/**
 * AI Runtime V3 — Provider Health & Circuit Breaker
 *
 * Tracks rolling health metrics per provider + model + credential.
 * Implements circuit breaking: consecutive failures → cooldown.
 */

import type { ProviderHealth } from './types'

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_CONSECUTIVE_FAILURES = 3
const COOLDOWN_MS = 30_000
const P50_WINDOW = 50
const MAX_LATENCY_HISTORY = 100

// ── State ────────────────────────────────────────────────────────────────────

interface HealthEntry extends ProviderHealth {
  latencyHistory: number[]
}

const healthMap = new Map<string, HealthEntry>()

function healthKey(provider: string, model: string, credentialId: string): string {
  return `${provider}:${model}:${credentialId}`
}

function getEntry(provider: string, model: string, credentialId: string): HealthEntry {
  const key = healthKey(provider, model, credentialId)
  let entry = healthMap.get(key)
  if (!entry) {
    entry = {
      provider,
      model,
      credentialId,
      status: 'HEALTHY',
      requests: 0,
      successes: 0,
      errors: 0,
      timeouts: 0,
      rateLimits: 0,
      malformedResponses: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      lastFailureAt: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
      latencyHistory: [],
    }
    healthMap.set(key, entry)
  }
  return entry
}

// ── Recording ─────────────────────────────────────────────────────────────────

export type FailureType = 'error' | 'timeout' | 'rate_limit' | 'malformed'

export function recordSuccess(
  provider: string,
  model: string,
  credentialId: string,
  latencyMs: number,
): void {
  const entry = getEntry(provider, model, credentialId)
  entry.requests += 1
  entry.successes += 1
  entry.consecutiveFailures = 0
  entry.latencyHistory.push(latencyMs)
  if (entry.latencyHistory.length > MAX_LATENCY_HISTORY) {
    entry.latencyHistory = entry.latencyHistory.slice(-MAX_LATENCY_HISTORY)
  }
  updateLatencies(entry)
  updateStatus(entry)
}

export function recordFailure(
  provider: string,
  model: string,
  credentialId: string,
  failureType: FailureType,
  latencyMs?: number,
): void {
  const entry = getEntry(provider, model, credentialId)
  entry.requests += 1
  entry.consecutiveFailures += 1
  entry.lastFailureAt = Date.now()

  switch (failureType) {
    case 'error': entry.errors += 1; break
    case 'timeout': entry.timeouts += 1; break
    case 'rate_limit': entry.rateLimits += 1; break
    case 'malformed': entry.malformedResponses += 1; break
  }

  if (latencyMs) {
    entry.latencyHistory.push(latencyMs)
    if (entry.latencyHistory.length > MAX_LATENCY_HISTORY) {
      entry.latencyHistory = entry.latencyHistory.slice(-MAX_LATENCY_HISTORY)
    }
  }

  // Circuit breaker: consecutive failures trigger cooldown
  if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    entry.status = 'UNHEALTHY'
    entry.cooldownUntil = Date.now() + COOLDOWN_MS
  } else if (failureType === 'rate_limit') {
    entry.status = 'RATE_LIMITED'
    entry.cooldownUntil = Date.now() + 10_000
  } else if (entry.consecutiveFailures >= 2) {
    entry.status = 'DEGRADED'
  }

  updateLatencies(entry)
}

// ── Status ────────────────────────────────────────────────────────────────────

function updateLatencies(entry: HealthEntry): void {
  if (entry.latencyHistory.length === 0) return
  const sorted = [...entry.latencyHistory].sort((a, b) => a - b)
  entry.p50LatencyMs = sorted[Math.floor(sorted.length * 0.5)] || 0
  entry.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] || 0
}

function updateStatus(entry: HealthEntry): void {
  // Check cooldown expiry
  if (entry.cooldownUntil && Date.now() >= entry.cooldownUntil) {
    entry.cooldownUntil = null
    entry.consecutiveFailures = 0
  }

  if (entry.cooldownUntil && Date.now() < entry.cooldownUntil) {
    // Still in cooldown
    if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      entry.status = 'UNHEALTHY'
    } else {
      entry.status = 'DEGRADED'
    }
    return
  }

  // Recover after successes
  if (entry.consecutiveFailures === 0 && entry.status !== 'HEALTHY') {
    entry.status = 'HEALTHY'
  }
}

export function isHealthy(provider: string, model: string, credentialId: string): boolean {
  const entry = getEntry(provider, model, credentialId)
  updateStatus(entry)
  return entry.status === 'HEALTHY'
}

export function isAvailable(provider: string, model: string, credentialId: string): boolean {
  const entry = getEntry(provider, model, credentialId)
  updateStatus(entry)
  return entry.status !== 'UNHEALTHY'
}

export function getHealth(
  provider: string,
  model: string,
  credentialId: string,
): ProviderHealth {
  const entry = getEntry(provider, model, credentialId)
  updateStatus(entry)
  return { ...entry }
}

export function getAllHealth(): ProviderHealth[] {
  const results: ProviderHealth[] = []
  for (const entry of healthMap.values()) {
    updateStatus(entry)
    results.push({ ...entry })
  }
  return results
}

export function getCooldownRemaining(
  provider: string,
  model: string,
  credentialId: string,
): number {
  const entry = getEntry(provider, model, credentialId)
  if (!entry.cooldownUntil) return 0
  return Math.max(0, entry.cooldownUntil - Date.now())
}

export function resetHealth(): void {
  healthMap.clear()
}
