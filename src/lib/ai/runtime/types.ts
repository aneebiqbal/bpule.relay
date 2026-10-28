/**
 * AI Runtime V3 — Provider & Task Types
 *
 * Central types for the unified AI execution layer.
 */


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


export interface NormalizedJsonOutput {
  data: Record<string, unknown>
  /** Original provider keys before normalization */
  rawKeys: string[]
  /** Whether any coercion was applied */
  wasCoerced: boolean
}


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
  /** Runtime version for tracking which router served this call */
  runtimeVersion: string
  /** Where in the code this call originated */
  callSite: string
  /** Why the primary provider was skipped (health, rate limit, etc.) */
  skippedProviders?: Array<{ provider: string; model: string; reason: string }>
  /** Feature that initiated this call */
  feature: string
  /** Intelligence tier used: luna | terra | sol */
  modelTier?: 'luna' | 'terra' | 'sol'
  /** Prompt version identifier for regression tracking */
  promptVersion?: string
  /** Whether result was served from deterministic cache */
  cacheHit?: boolean
  leadId?: string | null
  jobId?: string | null
  repId?: string | null
  /** Correlates every trace for one user request across features. */
  requestId?: string | null
  /** Links the trace to the decision run that produced it. */
  decisionRunId?: string | null
  /** Structured failure reason. Raw `error` stays free text for debugging. */
  failureCategory?: AiFailureCategory | null
}

/**
 * A structured failure category. Dashboards must read this, never parse the
 * free-text `error` string.
 */
export type AiFailureCategory =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_4XX'
  | 'PROVIDER_5XX'
  | 'NETWORK_ERROR'
  | 'SCHEMA_INVALID'
  | 'VALIDATION_FAILED'
  | 'QUALITY_BLOCKED'
  | 'CACHE_FAILURE'
  | 'STORAGE_FAILURE'
  | 'CANCELLED'
  | 'UNKNOWN'

/**
 * Canonical trace context. Passed from the request boundary through the AI
 * runtime. Ids only — never raw source text, client messages, emails or phones.
 */
export interface TraceContext {
  requestId: string
  organizationId?: string | null
  leadId?: string | null
  jobId?: string | null
  repId?: string | null
  decisionRunId?: string | null
}

/** Classify a provider/runtime failure into a stable category. */
export function classifyAiFailure(error: string | null | undefined, status?: number | null): AiFailureCategory {
  if (status === 401 || status === 403) return 'PROVIDER_AUTH'
  if (status === 429) return 'PROVIDER_RATE_LIMIT'
  if (status === 408 || status === 504) return 'PROVIDER_TIMEOUT'
  if (status === 400 || status === 422) return 'PROVIDER_4XX'
  if (typeof status === 'number' && status >= 500) return 'PROVIDER_5XX'
  const text = (error ?? '').toLowerCase()
  if (!text) return 'UNKNOWN'
  if (/timeout|timed out|etimedout|deadline/.test(text)) return 'PROVIDER_TIMEOUT'
  if (/rate.?limit|429|too many requests/.test(text)) return 'PROVIDER_RATE_LIMIT'
  if (/unauthor|forbidden|invalid api key|401|403/.test(text)) return 'PROVIDER_AUTH'
  if (/schema|json|parse|invalid response/.test(text)) return 'SCHEMA_INVALID'
  if (/enotfound|econnreset|econnrefused|network|fetch failed|socket/.test(text)) return 'NETWORK_ERROR'
  if (/abort|cancel/.test(text)) return 'CANCELLED'
  if (/cache/.test(text)) return 'CACHE_FAILURE'
  if (/storage|s3|bucket|upload/.test(text)) return 'STORAGE_FAILURE'
  if (/quality|unsafe|blocked/.test(text)) return 'QUALITY_BLOCKED'
  if (/validation/.test(text)) return 'VALIDATION_FAILED'
  return 'UNKNOWN'
}
