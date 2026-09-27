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
 *
 * Intelligence flow:
 *   deterministic guard → cache check → tier selection → provider chain
 *     → schema validate → cache store → budget record → trace persist
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
import { resolveModel as resolveOpenAiModel, resolveModelForTier, callJson as openAiJson, callText as openAiText, hasOpenAi } from './providers/openai'
import { resolveModel as resolveLongCatModel, callJson as longcatJson, callText as longcatText, hasLongCat } from './providers/longcat'
import { persistTrace } from './telemetry'
import { validateShape, type ShapeSchema, schemaAsPromptInstruction } from './schemas'
import {
  defaultTierForTask,
  resolveTier,
  shouldEscalateTier,
  getTierConfig,
  type IntelligenceTier,
} from './model-router'
import { ContentCache } from '@/lib/ai/cache'
import { isBudgetExceeded, recordCost } from '@/lib/ai/budget'

// ── Task Profiles ────────────────────────────────────────────────────────────

const TASK_PROFILES: Record<TaskClass, TaskProfile> = {
  FAST_STRUCTURED: {
    taskClass: 'FAST_STRUCTURED',
    outputMode: 'json_object',
    reasoningLevel: 'NONE',
    maxTokens: 1024,
    timeoutMs: 10_000,
    stream: false,
    allowDeterministicFallback: true,
  },
  INTERACTIVE_WRITING: {
    taskClass: 'INTERACTIVE_WRITING',
    outputMode: 'text',
    reasoningLevel: 'LOW',
    maxTokens: 2048,
    timeoutMs: 15_000,
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
  /** Intelligence tier: luna | terra | sol — defaults by task */
  tier?: IntelligenceTier
  /** Prompt version for cache key + trace (e.g. 'conversation-understand-v1') */
  promptVersion?: string
  /** Schema definition for output validation (ShapeSchema format) */
  outputSchema?: ShapeSchema
  /** Skip cache (force fresh generation) */
  skipCache?: boolean
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
  cacheHit?: boolean
}

// ── Cache ────────────────────────────────────────────────────────────────────

const resultCache = new ContentCache<unknown>({ maxSize: 500, ttlMs: 15 * 60 * 1000, version: 'ai-runtime-v3' })

function cacheKey(opts: Pick<GenerateOptions, 'task' | 'system' | 'user' | 'promptVersion' | 'schemaName'>): string {
  const parts = [opts.task, opts.promptVersion || 'unversioned', opts.schemaName || 'none', opts.system, opts.user]
  return parts.join('::')
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
  const tier = resolveTier(options.tier, options.task)

  // Schema injection: append shape instruction to user prompt if schema provided
  let user = options.user
  if (options.outputSchema) {
    user = `${options.user}\n\n${schemaAsPromptInstruction(options.outputSchema)}\n\nRespond with a single JSON object only.`
  } else if (options.schema && !/\bjson\b/i.test(options.user)) {
    user = `${options.user}\n\nRespond with a single JSON object only.`
  }
  const useJson = Boolean(options.schema || options.outputSchema) && !options.onChunk && !options.stream

  // ── Cache Check ───────────────────────────────────────────────────────────
  if (!options.skipCache) {
    const key = cacheKey({ task: options.task, system: options.system, user: options.user, promptVersion: options.promptVersion, schemaName: options.schemaName })
    const cached = resultCache.get(key)
    if (cached !== null) {
      const trace: AiTrace = {
        ...traceBase,
        provider: 'cache',
        model: 'cache',
        credentialId: 'cache',
        costTier: 'cache',
        attempt: 0,
        inputTokens: 0,
        outputTokens: 0,
        ttfbMs: 0,
        latencyMs: 0,
        estimatedCostUsd: 0,
        schemaValid: true,
        quality: 'UNASSESSED',
        fallback: false,
        fallbackReason: null,
        error: null,
        runtimeVersion: RUNTIME_VERSION,
        callSite: options.callSite ?? 'unknown',
        feature: options.feature ?? 'unknown',
        modelTier: tier,
        promptVersion: options.promptVersion,
        cacheHit: true,
      }
      logTrace(trace)
      return { data: cached as T, trace, cacheHit: true }
    }
  }

  // ── Budget Guard ──────────────────────────────────────────────────────────
  const tierConfig = getTierConfig(tier)
  if (tierConfig.budgetClass === 'expensive' && isBudgetExceeded()) {
    throw new Error('AI budget exceeded — expensive tier blocked')
  }

  // ── Provider Chain ───────────────────────────────────────────────────────
  let currentTier: IntelligenceTier = tier

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i]

    // For OpenAI steps, use the intelligence tier model
    const resolved = step.provider === 'openai'
      ? { ...resolveModelForTier(currentTier), model: resolveModelForTier(currentTier).model, baseUrl: resolveModelForTier(currentTier).baseUrl, provider: 'openai' }
      : step.modelResolver(options.modelOverride)

    if (!providerHasCredentials(step.provider)) {
      skippedProviders.push({ provider: resolved.provider, model: resolved.model, reason: 'missing_credentials' })
      continue
    }

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

      // ── Schema Validation ────────────────────────────────────────────────
      let schemaValid = true
      let validationRetries = 0
      if (options.outputSchema && useJson && typeof result.data === 'object' && result.data !== null) {
        const validation = validateShape(result.data as Record<string, unknown>, options.outputSchema)
        if (!validation.valid && validationRetries < 1) {
          validationRetries++
          // Retry once with corrective instruction
          const correctiveUser = `${user}\n\nPREVIOUS OUTPUT INVALID. Missing: ${validation.missing.join(', ') || 'none'}. Type errors: ${validation.typeErrors.join(', ') || 'none'}. Fix and return valid JSON.`
          const retryParams: JsonCallParams = {
            system: options.system,
            user: correctiveUser,
            schema: options.schema,
            schemaName: options.schemaName,
            maxTokens,
            temperature,
            onStatus: options.onStatus,
            signal: options.signal,
          }
          const retryResult = await callJsonByProvider(step.provider, providerModel, retryParams, timeoutMs)
          const retryValidation = validateShape(retryResult.data as Record<string, unknown>, options.outputSchema)
          if (retryValidation.valid) {
            result = retryResult
            schemaValid = true
          } else {
            schemaValid = false
            recordFailure(resolved.provider, resolved.model, step.credentialId, 'malformed', result.latencyMs)
          }
        } else if (!validation.valid) {
          schemaValid = false
        }
      }

      const costTier = step.provider === 'openai' ? 'tier4' : step.provider === 'longcat' ? 'tier1' : 'tier1'
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
        schemaValid,
        quality: 'UNASSESSED',
        fallback: i > 0,
        fallbackReason: i > 0 ? errors[errors.length - 1]?.error ?? null : null,
        error: null,
        runtimeVersion: RUNTIME_VERSION,
        callSite: options.callSite ?? 'unknown',
        skippedProviders: skippedProviders.length > 0 ? skippedProviders : undefined,
        feature: options.feature ?? 'unknown',
        modelTier: tier,
        promptVersion: options.promptVersion,
      }

      // ── Budget Record ────────────────────────────────────────────────────
      recordCost({
        feature: options.feature ?? 'unknown',
        operation: options.task,
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        cacheHit: false,
        retryCount: validationRetries,
        fallback: i > 0,
        estimatedCostUsd: result.estimatedCostUsd,
        costTier,
      })

      // ── Cache Store ──────────────────────────────────────────────────────
      if (!options.skipCache && schemaValid) {
        const key = cacheKey({ task: options.task, system: options.system, user: options.user, promptVersion: options.promptVersion, schemaName: options.schemaName })
        resultCache.set(key, result.data)
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

      // Tier escalation check for OpenAI path
      if (step.provider === 'openai') {
        const esc = shouldEscalateTier({
          taskClass: options.task,
          primaryTier: currentTier,
          attemptCount: errors.length,
          malformedOutput: errorMsg.includes('malformed') || errorMsg.includes('INVALID'),
          isHighValue: options.feature === 'high_value_lead',
          qualityFailed: false,
        })
        if (esc.escalate && esc.toTier !== currentTier) {
          currentTier = esc.toTier
        }
      }

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
    modelTier: tier,
    promptVersion: options.promptVersion,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  const schema = trace.schemaValid === false ? ' schema=INVALID' : ''
  const cache = trace.cacheHit ? ' cache=hit' : ''
  const mTier = trace.modelTier ? ` tier=${trace.modelTier}` : ''
  const pVer = trace.promptVersion ? ` prompt=${trace.promptVersion}` : ''
  console.info(
    `[relay-ai] task=${trace.taskClass} provider=${trace.provider} model=${trace.model} ` +
    `attempt=${trace.attempt} input_tokens=${trace.inputTokens} output_tokens=${trace.outputTokens} ` +
    `ttfb=${trace.ttfbMs}ms latency=${trace.latencyMs}ms cost=$${trace.estimatedCostUsd.toFixed(6)} ` +
    `runtime=${trace.runtimeVersion} site=${trace.callSite} feature=${trace.feature}` +
    `${mTier}${pVer}${cache}${fallback}${skipped}${schema}${error}`,
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
export { defaultTierForTask, resolveTier, shouldEscalateTier, getTierConfig, TIER_REGISTRY } from './model-router'
export { validateShape, type ShapeSchema, type FieldSpec } from './schemas'
export function clearResultCache(): void { resultCache.clear() }
export function getResultCacheSize(): number { return resultCache.size }
