/**
 * AI Runtime V3 — Central Router
 *
 * Single entry point for ALL AI operations in Relay.
 *
 * Usage:
 *   import { generate } from '@/lib/ai/runtime'
 *   const result = await generate({
 *     task: 'FAST_STRUCTURED',
 *     system: '...',
 *     user: '...',
 *     schema: { ... },
 *   })
 */

import type {
  TaskClass,
  TaskProfile,
  ProviderResult,
  JsonCallParams,
  TextCallParams,
  AiTrace,
} from './types'
import { isAvailable, recordFailure } from './health'
import { resolveModel as resolveGroqModel, callJson as groqJson, callText as groqText, hasGroq } from './providers/groq'
import { resolveModel as resolveOpenCodeModel, callJson as openCodeJson, callText as openCodeText, hasOpenCode } from './providers/opencode'
import { resolveModel as resolveOpenAiModel, callJson as openAiJson, callText as openAiText, hasOpenAi } from './providers/openai'
import { resolveModel as resolveLongCatModel, callJson as longcatJson, callText as longcatText, hasLongCat } from './providers/longcat'
import { persistTrace } from './telemetry'

// ── Task Profiles ────────────────────────────────────────────────────────────

const TASK_PROFILES: Record<TaskClass, TaskProfile> = {
  FAST_STRUCTURED: {
    taskClass: 'FAST_STRUCTURED',
    outputMode: 'json_object',
    reasoningLevel: 'NONE',
    maxTokens: 1024,
    timeoutMs: 10_000, // OpenCode Go ~1.4s, allow headroom
    stream: false,
    allowDeterministicFallback: true,
  },
  INTERACTIVE_WRITING: {
    taskClass: 'INTERACTIVE_WRITING',
    outputMode: 'text',
    reasoningLevel: 'LOW',
    maxTokens: 2048,
    timeoutMs: 15_000, // OpenCode Go ~1.5-3s for writing
    stream: true,
    allowDeterministicFallback: true,
  },
  DEEP_WRITING: {
    taskClass: 'DEEP_WRITING',
    outputMode: 'text',
    reasoningLevel: 'MEDIUM',
    maxTokens: 4096,
    timeoutMs: 30_000,
    stream: true,
    allowDeterministicFallback: false,
  },
  BACKGROUND_INTELLIGENCE: {
    taskClass: 'BACKGROUND_INTELLIGENCE',
    outputMode: 'json_object',
    reasoningLevel: 'HIGH',
    maxTokens: 4096,
    timeoutMs: 60_000,
    stream: false,
    allowDeterministicFallback: true,
  },
}

// ── Provider Chain per Task ─────────────────────────────────────────────────

interface ChainEntry {
  provider: 'groq' | 'opencode' | 'openai' | 'longcat'
  modelResolver: (modelId?: string) => { model: string; baseUrl: string; provider: string }
  credentialId: string
}

function getChainForTask(taskClass: TaskClass): ChainEntry[] {
  // OpenCode Go is the primary for most tasks — evidence shows glm-5.3-flash is
  // the best balance of speed (1.4s), quality (perfect JSON extraction), and cost.
  // Groq is the fallback (fast but rate-limited). GPT is the safety net.
  //
  // LongCat is EXCLUDED from FAST_STRUCTURED — if OpenCode+Groq+OpenAI all fail,
  // waiting 30-50s for LongCat is worse UX than a clean retry. LongCat only runs
  // first for BACKGROUND workloads where latency doesn't matter.
  switch (taskClass) {
    case 'FAST_STRUCTURED':
      return [
        { provider: 'opencode', modelResolver: resolveOpenCodeModel, credentialId: 'opencode-primary' },
        { provider: 'groq', modelResolver: resolveGroqModel, credentialId: 'groq-primary' },
        { provider: 'openai', modelResolver: resolveOpenAiModel, credentialId: 'openai-primary' },
      ]
    case 'INTERACTIVE_WRITING':
      return [
        { provider: 'opencode', modelResolver: resolveOpenCodeModel, credentialId: 'opencode-primary' },
        { provider: 'groq', modelResolver: resolveGroqModel, credentialId: 'groq-primary' },
        { provider: 'openai', modelResolver: resolveOpenAiModel, credentialId: 'openai-primary' },
        { provider: 'longcat', modelResolver: resolveLongCatModel, credentialId: 'longcat-primary' },
      ]
    case 'DEEP_WRITING':
      return [
        { provider: 'opencode', modelResolver: resolveOpenCodeModel, credentialId: 'opencode-primary' },
        { provider: 'groq', modelResolver: resolveGroqModel, credentialId: 'groq-primary' },
        { provider: 'openai', modelResolver: resolveOpenAiModel, credentialId: 'openai-primary' },
        { provider: 'longcat', modelResolver: resolveLongCatModel, credentialId: 'longcat-primary' },
      ]
    case 'BACKGROUND_INTELLIGENCE':
      return [
        { provider: 'longcat', modelResolver: resolveLongCatModel, credentialId: 'longcat-primary' },
        { provider: 'opencode', modelResolver: resolveOpenCodeModel, credentialId: 'opencode-primary' },
        { provider: 'groq', modelResolver: resolveGroqModel, credentialId: 'groq-primary' },
        { provider: 'openai', modelResolver: resolveOpenAiModel, credentialId: 'openai-primary' },
      ]
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface GenerateOptions {
  task: TaskClass
  system: string
  user: string
  schema?: Record<string, unknown>
  schemaName?: string
  maxTokens?: number
  temperature?: number
  stream?: boolean
  onChunk?: (delta: string) => void
  onStatus?: (msg: string) => void
  signal?: AbortSignal
  modelOverride?: string
  /** Organization ID for telemetry persistence */
  organizationId?: string
  /** Where in the code this call originated (e.g. 'extraction-pipeline:runPassA') */
  callSite?: string
  /** Feature that initiated this call (e.g. 'prospect_analysis', 'connection_note') */
  feature?: string
}

export interface GenerateResult<T> {
  data: T
  trace: AiTrace
}

// ── Main Generate Function ──────────────────────────────────────────────────

export async function generate<T = Record<string, unknown>>(
  options: GenerateOptions,
): Promise<GenerateResult<T>> {
  const profile = TASK_PROFILES[options.task]
  const maxTokens = options.maxTokens || profile.maxTokens
  const temperature = options.temperature ?? defaultTemperature(options.task)
  const timeoutMs = profile.timeoutMs
  const taskId = generateTaskId()
  const traceBase = {
    taskId,
    taskClass: options.task,
    inputChars: options.system.length + options.user.length,
    timestamp: Date.now(),
  }

  const chain = getChainForTask(options.task)
  const errors: Array<{ provider: string; model: string; error: string }> = []
  const skippedProviders: Array<{ provider: string; model: string; reason: string }> = []
  const RUNTIME_VERSION = 'runtime-v3'
  const user = options.schema && !/\bjson\b/i.test(options.user)
    ? `${options.user}\n\nRespond with a single JSON object only.`
    : options.user
  const useJson = Boolean(options.schema) && !options.onChunk

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i]
    const resolved = step.modelResolver(options.modelOverride)

    if (!providerHasCredentials(step.provider)) {
      skippedProviders.push({ provider: resolved.provider, model: resolved.model, reason: 'missing_credentials' })
      continue
    }

    // Skip unhealthy providers
    if (!isAvailable(resolved.provider, resolved.model, step.credentialId)) {
      const reason = 'skipped_unhealthy'
      errors.push({ provider: resolved.provider, model: resolved.model, error: reason })
      skippedProviders.push({ provider: resolved.provider, model: resolved.model, reason })
      continue
    }

    const providerModel = {
      provider: resolved.provider,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      costPerInputToken: 0,
      costPerOutputToken: 0,
      supportsStreaming: true,
      supportsJsonSchema: true,
      maxContextTokens: 128_000,
    }

    try {
      let result: ProviderResult<unknown>

      if (useJson || (profile.outputMode === 'json_object' && !options.stream && !options.onChunk)) {
        const params: JsonCallParams = {
          system: options.system,
          user,
          schema: options.schema,
          schemaName: options.schemaName,
          maxTokens,
          temperature,
          onStatus: options.onStatus,
          signal: options.signal,
        }
        result = await callJsonByProvider(step.provider, providerModel, params, timeoutMs)
      } else {
        const params: TextCallParams = {
          system: options.system,
          user,
          maxTokens,
          temperature,
          onChunk: options.onChunk,
          onStatus: options.onStatus,
          signal: options.signal,
        }
        result = await callTextByProvider(step.provider, providerModel, params, timeoutMs)
      }

      const costTier = step.provider === 'openai' ? 'tier4' : step.provider === 'opencode' ? 'tier1' : step.provider === 'longcat' ? 'tier1' : 'tier1'
      const trace: AiTrace = {
        ...traceBase,
        provider: result.provider,
        model: result.model,
        credentialId: result.credentialId,
        costTier,
        attempt: i + 1,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        ttfbMs: result.ttfbMs,
        latencyMs: result.latencyMs,
        estimatedCostUsd: result.estimatedCostUsd,
        schemaValid: true,
        quality: 'UNASSESSED',
        fallback: i > 0,
        fallbackReason: i > 0 ? errors[errors.length - 1]?.error ?? null : null,
        error: null,
        runtimeVersion: RUNTIME_VERSION,
        callSite: options.callSite ?? 'unknown',
        skippedProviders: skippedProviders.length > 0 ? skippedProviders : undefined,
        feature: options.feature ?? 'unknown',
      }

      logTrace(trace)
      if (options.organizationId) {
        void persistTrace(trace, options.organizationId)
      }
      return { data: result.data as T, trace }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      errors.push({ provider: resolved.provider, model: resolved.model, error: errorMsg })
      recordFailure(resolved.provider, resolved.model, step.credentialId, 'error')

      // Try next provider
      continue
    }
  }

  // All providers failed
  const trace: AiTrace = {
    ...traceBase,
    provider: 'none',
    model: 'none',
    credentialId: 'none',
    attempt: errors.length,
    inputTokens: 0,
    outputTokens: 0,
    ttfbMs: null,
    latencyMs: 0,
    estimatedCostUsd: 0,
    schemaValid: false,
    quality: 'UNASSESSED',
    fallback: errors.length > 1,
    fallbackReason: null,
    error: errors.map((e) => `${e.provider}/${e.model}: ${e.error}`).join('; '),
    runtimeVersion: RUNTIME_VERSION,
    callSite: options.callSite ?? 'unknown',
    skippedProviders: skippedProviders.length > 0 ? skippedProviders : undefined,
    feature: options.feature ?? 'unknown',
  }
  logTrace(trace)
  if (options.organizationId) {
    void persistTrace(trace, options.organizationId)
  }
  throw new Error(`All providers failed: ${trace.error}`)
}

// ── Provider Dispatch ────────────────────────────────────────────────────────

async function callJsonByProvider(
  provider: string,
  model: { provider: string; model: string; baseUrl: string; costPerInputToken: number; costPerOutputToken: number; supportsStreaming: boolean; supportsJsonSchema: boolean; maxContextTokens: number },
  params: JsonCallParams,
  timeoutMs: number,
): Promise<ProviderResult<unknown>> {
  switch (provider) {
    case 'groq': return groqJson(model as any, params, timeoutMs)
    case 'opencode': return openCodeJson(model as any, params, timeoutMs)
    case 'openai': return openAiJson(model as any, params, timeoutMs)
    case 'longcat': return longcatJson(model as any, params, timeoutMs)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

async function callTextByProvider(
  provider: string,
  model: { provider: string; model: string; baseUrl: string; costPerInputToken: number; costPerOutputToken: number; supportsStreaming: boolean; supportsJsonSchema: boolean; maxContextTokens: number },
  params: TextCallParams,
  timeoutMs: number,
): Promise<ProviderResult<string>> {
  switch (provider) {
    case 'groq': return groqText(model as any, params, timeoutMs)
    case 'opencode': return openCodeText(model as any, params, timeoutMs)
    case 'openai': return openAiText(model as any, params, timeoutMs)
    case 'longcat': return longcatText(model as any, params, timeoutMs)
    default: throw new Error(`Unknown provider: ${provider}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function providerHasCredentials(provider: string): boolean {
  switch (provider) {
    case 'opencode': return hasOpenCode()
    case 'groq': return hasGroq()
    case 'openai': return hasOpenAi()
    case 'longcat': return hasLongCat()
    default: return false
  }
}

function defaultTemperature(task: TaskClass): number {
  switch (task) {
    case 'FAST_STRUCTURED': return 0.1
    case 'INTERACTIVE_WRITING': return 0.7
    case 'DEEP_WRITING': return 0.6
    case 'BACKGROUND_INTELLIGENCE': return 0.3
  }
}

function generateTaskId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function logTrace(trace: AiTrace): void {
  const fallback = trace.fallback ? ` (fallback: ${trace.fallbackReason})` : ''
  const error = trace.error ? ` ERROR: ${trace.error}` : ''
  const skipped = trace.skippedProviders?.length
    ? ` skipped=[${trace.skippedProviders.map((s) => `${s.provider}:${s.reason}`).join(',')}]`
    : ''
  console.info(
    `[relay-ai] task=${trace.taskClass} provider=${trace.provider} model=${trace.model} ` +
    `attempt=${trace.attempt} input_tokens=${trace.inputTokens} output_tokens=${trace.outputTokens} ` +
    `ttfb=${trace.ttfbMs}ms latency=${trace.latencyMs}ms cost=\$${trace.estimatedCostUsd.toFixed(6)} ` +
    `runtime=${trace.runtimeVersion} site=${trace.callSite} feature=${trace.feature}` +
    `${fallback}${skipped}${error}`,
  )
}

// ── Exports ──────────────────────────────────────────────────────────────────

export { TASK_PROFILES }
export type { TaskProfile } from './types'
export { isAvailable, getAllHealth, getHealth, getCooldownRemaining, resetHealth } from './health'
export { hasGroq } from './providers/groq'
export { hasOpenCode } from './providers/opencode'
export { hasOpenAi } from './providers/openai'
export { hasLongCat } from './providers/longcat'
