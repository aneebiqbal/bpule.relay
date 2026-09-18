/**
 * AI Runtime V3 — Provider & Task Types
 *
 * Central types for the unified AI execution layer.
 */

// ── Task Classification ─────────────────────────────────────────────────────

export type TaskClass =
  | 'FAST_STRUCTURED'
  | 'INTERACTIVE_WRITING'
  | 'DEEP_WRITING'
  | 'BACKGROUND_INTELLIGENCE'

export type OutputMode = 'json_object' | 'json_schema' | 'text'

export type ReasoningLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'

export interface TaskProfile {
  taskClass: TaskClass
  outputMode: OutputMode
  reasoningLevel: ReasoningLevel
  maxTokens: number
  timeoutMs: number
  /** Whether streaming is beneficial for this task */
  stream: boolean
  /** Whether this task can use deterministic fallback */
  allowDeterministicFallback: boolean
}

// ── Provider Types ───────────────────────────────────────────────────────────

export interface ProviderModel {
  provider: string
  model: string
  baseUrl: string
  /** Cost per 1M input tokens (USD) */
  costPerInputToken: number
  /** Cost per 1M output tokens (USD) */
  costPerOutputToken: number
  /** Whether provider supports streaming */
  supportsStreaming: boolean
  /** Whether provider supports json_schema mode */
  supportsJsonSchema: boolean
  /** Max context length */
  maxContextTokens: number
}

export interface ProviderHealth {
  provider: string
  model: string
  credentialId: string
  status: 'HEALTHY' | 'DEGRADED' | 'RATE_LIMITED' | 'UNHEALTHY'
  requests: number
  successes: number
  errors: number
  timeouts: number
  rateLimits: number
  malformedResponses: number
  p50LatencyMs: number
  p95LatencyMs: number
  lastFailureAt: number | null
  consecutiveFailures: number
  cooldownUntil: number | null
}

export interface ProviderResult<T> {
  data: T
  provider: string
  model: string
  credentialId: string
  latencyMs: number
  ttfbMs: number | null
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  attempt: number
  fallback: boolean
  fallbackReason: string | null
}

export interface JsonCallParams {
  system: string
  user: string
  schema?: Record<string, unknown>
  schemaName?: string
  maxTokens?: number
  temperature?: number
  onStatus?: (msg: string) => void
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

export interface TextCallParams {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  onChunk?: (delta: string) => void
  onStatus?: (msg: string) => void
  signal?: AbortSignal
}

// ── Normalized Output ───────────────────────────────────────────────────────

export interface NormalizedJsonOutput {
  data: Record<string, unknown>
  /** Original provider keys before normalization */
  rawKeys: string[]
  /** Whether any coercion was applied */
  wasCoerced: boolean
}

// ── Trace / Observability ───────────────────────────────────────────────────

export interface AiTrace {
  taskId: string
  taskClass: TaskClass
  provider: string
  model: string
  credentialId: string
  /** Cost tier label (e.g. 'tier1', 'tier4') for usage dashboards */
  costTier?: string
  attempt: number
  inputTokens: number
  outputTokens: number
  inputChars: number
  ttfbMs: number | null
  latencyMs: number
  estimatedCostUsd: number
  schemaValid: boolean
  quality: 'GOOD' | 'LIGHT_EDIT' | 'BAD' | 'UNSAFE' | 'UNASSESSED'
  fallback: boolean
  fallbackReason: string | null
  error: string | null
  timestamp: number
}
