/**
 * AI Runtime V3 — Compatibility Layer
 *
 * Drop-in replacements for legacy AI functions.
 * Routes all calls through runtime.generate() with proper task classification.
 *
 * This allows existing code to work unchanged while benefiting from:
 * - Health-aware routing
 * - Automatic fallback
 * - Circuit breaking
 * - Telemetry persistence
 *
 * All interactive production flows MUST route through runtime.generate().
 */

import { generate, type GenerateOptions, type GenerateResult } from './index'
import type { TaskClass } from './types'

// ── Task Classification Helper ───────────────────────────────────────────────

function classifyFromContext(system: string, schema?: Record<string, unknown>): TaskClass {
  const lower = system.toLowerCase()
  // Writing tasks
  if (lower.includes('write') || lower.includes('draft') || lower.includes('connection note') ||
      lower.includes('message') || lower.includes('reply') || lower.includes('email') ||
      lower.includes('outreach') || lower.includes('proposal') || lower.includes('resume')) {
    if (lower.includes('proposal') || lower.includes('resume') || lower.includes('complex') ||
        lower.includes('deep') || lower.includes('premium') || lower.includes('difficult')) {
      return 'DEEP_WRITING'
    }
    return 'INTERACTIVE_WRITING'
  }
  // Background tasks
  if (lower.includes('enrichment') || lower.includes('research') || lower.includes('batch') ||
      lower.includes('offline') || lower.includes('background') || lower.includes('genome')) {
    return 'BACKGROUND_INTELLIGENCE'
  }
  // Default: structured extraction
  return 'FAST_STRUCTURED'
}

// ── structuredJsonChain (replacement) ────────────────────────────────────────

export interface StructuredJsonChainOptions {
  system: string
  user: string
  schema: Record<string, unknown>
  schemaName?: string
  onStatus?: (msg: string) => void
  maxTokens?: number
  organizationId?: string
  callSite?: string
  feature?: string
}

export async function structuredJsonChain<T = Record<string, unknown>>(
  options: StructuredJsonChainOptions,
): Promise<T> {
  const result = await generate<T>({
    task: 'FAST_STRUCTURED',
    system: options.system,
    user: options.user,
    schema: options.schema,
    schemaName: options.schemaName,
    maxTokens: options.maxTokens,
    onStatus: options.onStatus,
    organizationId: options.organizationId,
    callSite: options.callSite,
    feature: options.feature,
  })
  return result.data
}

// ── streamChatTextChain (replacement) ────────────────────────────────────────

export interface StreamTextChainOptions {
  system: string
  user: string
  temperature?: number
  onChunk?: (delta: string) => void
  onStatus?: (msg: string) => void
  maxTokens?: number
  organizationId?: string
  /** Force a specific task class */
  taskClass?: TaskClass
  callSite?: string
  feature?: string
}

export async function streamTextChain(
  options: StreamTextChainOptions,
): Promise<string> {
  const result = await generate<string>({
    task: options.taskClass || classifyFromContext(options.system),
    system: options.system,
    user: options.user,
    temperature: options.temperature,
    stream: true,
    onChunk: options.onChunk,
    onStatus: options.onStatus,
    maxTokens: options.maxTokens,
    organizationId: options.organizationId,
    callSite: options.callSite,
    feature: options.feature,
  })
  return result.data
}

// ── Legacy single-model structuredJson (replacement) ─────────────────────────

export async function structuredJsonLegacy<T = Record<string, unknown>>(opts: {
  system: string
  user: string
  schema: Record<string, unknown>
  model?: string
  responseMode?: 'json_object' | 'json_schema'
  schemaName?: string
  strict?: boolean
  onStatus?: (msg: string) => void
  organizationId?: string
  callSite?: string
  feature?: string
}): Promise<T> {
  const result = await generate<T>({
    task: 'FAST_STRUCTURED',
    system: opts.system,
    user: opts.user,
    schema: opts.schema,
    schemaName: opts.schemaName,
    onStatus: opts.onStatus,
    organizationId: opts.organizationId,
    modelOverride: opts.model,
    callSite: opts.callSite,
    feature: opts.feature,
  })
  return result.data
}

// ── Batch generate for parallel operations ───────────────────────────────────

export async function generateBatch<T = Record<string, unknown>>(
  tasks: Array<Omit<GenerateOptions, 'signal'>>,
): Promise<Array<GenerateResult<T>>> {
  return Promise.all(tasks.map((t) => generate<T>(t)))
}
