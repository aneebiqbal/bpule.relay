/**
 * Provider HTTP: one bounded, retrying, telemetry-recording call.
 *
 * A provider outage must never take Relay down — every failure is classified,
 * recorded, and thrown as a `ProviderError`. Retries are bounded (never
 * infinite) and only on transient statuses.
 */
import type { ProviderName } from './types'

export type ProviderErrorCategory =
  | 'RATE_LIMITED'
  | 'INVALID_KEY'
  | 'PLAN_REQUIRED'
  | 'INSUFFICIENT_CREDITS'
  | 'INVALID_FILTERS'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'ERROR'

export class ProviderError extends Error {
  readonly category: ProviderErrorCategory
  readonly status: number | null

  constructor(category: ProviderErrorCategory, message: string, status: number | null = null) {
    super(message)
    this.name = 'ProviderError'
    this.category = category
    this.status = status
  }
}

export type ProviderOperation =
  | 'SEARCH'
  | 'ENRICH'
  | 'REVEAL'
  | 'FIND'
  | 'VERIFY'
  | 'FIND_EMAIL'
  | 'VERIFY_EMAIL'
  | 'AUTH'

export interface ProviderTelemetryRecord {
  organizationId: string
  provider: ProviderName
  operation: ProviderOperation
  status: 'OK' | ProviderErrorCategory
  latencyMs: number
  credits: number
  searchRunId?: string | null
  errorCategory?: string | null
}

export type TelemetrySink = (record: ProviderTelemetryRecord) => void | Promise<void>

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 400

/** Classify an HTTP status + provider error body. */
export function classifyProviderError(status: number, code: string | null): ProviderErrorCategory {
  if (status === 429) return 'RATE_LIMITED'
  if (status === 401 || status === 403) return 'INVALID_KEY'
  if (status === 408) return 'TIMEOUT'
  if (status >= 500) return 'UNAVAILABLE'
  switch (code) {
    case 'INVALID_API_KEY':
      return 'INVALID_KEY'
    case 'PLAN_REQUIRED':
      return 'PLAN_REQUIRED'
    case 'INSUFFICIENT_CREDITS':
      return 'INSUFFICIENT_CREDITS'
    case 'INVALID_FILTERS':
    case 'INVALID_REQUEST':
    case 'INVALID_DATAPOINTS':
      return 'INVALID_FILTERS'
    case 'SERVICE_TEMPORARILY_UNAVAILABLE':
    case 'INTERNAL_ERROR':
      return 'UNAVAILABLE'
    default:
      return 'ERROR'
  }
}

function transient(category: ProviderErrorCategory, status: number | null): boolean {
  if (category === 'RATE_LIMITED' || category === 'UNAVAILABLE' || category === 'TIMEOUT') return true
  return status != null && status >= 500
}

export interface ProviderFetchOptions<T = unknown> {
  url: string
  init: RequestInit
  organizationId: string
  provider: ProviderName
  operation: ProviderOperation
  searchRunId?: string | null
  timeoutMs?: number
  telemetry?: TelemetrySink
  /** Attempts. Defaults to 3. */
  maxAttempts?: number
  /**
   * Adapter-supplied credit counter. Providers rarely return credits in the
   * body; the adapter knows what an operation costs (§14).
   */
  readCredits?: (body: T) => number
}

/**
 * Perform one provider call with bounded retry. Returns the parsed JSON body.
 * Never throws a raw fetch error — always a classified `ProviderError`.
 */
export async function providerFetch<T = unknown>(
  options: ProviderFetchOptions<T>,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  let last: ProviderError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now()
    try {
      const response = await fetch(options.url, {
        ...options.init,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - startedAt
      const text = await response.text()
      const body = text ? safeJson<T>(text) : ({} as T)
      const code = readErrorCode(body)

      if (!response.ok) {
        const category = classifyProviderError(response.status, code)
        await record(options, category, latencyMs, 0)
        last = new ProviderError(category, `${options.provider} ${options.operation} failed (${response.status}${code ? `: ${code}` : ''})`, response.status)
        if (transient(category, response.status) && attempt < maxAttempts) {
          await delay(BASE_DELAY_MS * 2 ** (attempt - 1))
          continue
        }
        throw last
      }

      const credits = options.readCredits ? options.readCredits(body) : readCredits(body)
      await record(options, 'OK', latencyMs, credits)
      return body
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      if (error instanceof ProviderError) throw error
      const category: ProviderErrorCategory =
        error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'UNAVAILABLE'
      await record(options, category, latencyMs, 0)
      last = new ProviderError(category, error instanceof Error ? error.message : String(error))
      if (attempt < maxAttempts) {
        await delay(BASE_DELAY_MS * 2 ** (attempt - 1))
        continue
      }
      throw last
    }
  }

  throw last ?? new ProviderError('ERROR', `${options.provider} ${options.operation} failed`)
}

async function record<T>(
  options: ProviderFetchOptions<T>,
  status: ProviderTelemetryRecord['status'],
  latencyMs: number,
  credits: number,
): Promise<void> {
  if (!options.telemetry) return
  try {
    await options.telemetry({
      organizationId: options.organizationId,
      provider: options.provider,
      operation: options.operation,
      status,
      latencyMs,
      credits,
      searchRunId: options.searchRunId ?? null,
      errorCategory: status === 'OK' ? null : status,
    })
  } catch {
    // Telemetry must never break a provider call.
  }
}

function safeJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return {} as T
  }
}

function readErrorCode(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const code = record.error_code ?? record.errorCode ?? record.code
    return typeof code === 'string' ? code : null
  }
  return null
}

function readCredits(body: unknown): number {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const credits = record.credits_used ?? record.credits
    return typeof credits === 'number' && Number.isFinite(credits) ? credits : 0
  }
  return 0
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
