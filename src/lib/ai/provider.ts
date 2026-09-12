import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

import { groqApiKey, groqBaseUrl } from '@/lib/ai/config'
import type { ChainStep } from '@/lib/ai/routing'
import { estimateCostUsd, estimateTokens, type CostTier } from '@/lib/ai/cost'

/**
 * Multi-host, multi-tier model provider (architecture v2, September 2026).
 *
 * A "chain" is an ordered list of hosts to try for one call: every host in
 * tier 1 (DeepSeek V4 Flash, one entry per configured provider — official API
 * and Fireworks are the same weights, genuinely interchangeable), then the
 * cross-family fallbacks (Groq, then OpenAI). A host only gets skipped to the
 * next one on a real failure — a timeout, a 5xx, a malformed response after
 * its own retry budget is exhausted — never just because it was slow once.
 * This is what "if one host is slow, retry against the other host before
 * considering it a real failure, not before falling back to a different
 * model family" means in code: exhaust tier 1's hosts before tier 3 is ever
 * touched.
 */

const clients = new Map<string, OpenAI>()

function clientFor(baseUrl: string, apiKey: string): OpenAI {
  const key = `${baseUrl}|${apiKey}`
  let c = clients.get(key)
  if (!c) {
    c = new OpenAI({ apiKey, baseURL: baseUrl })
    clients.set(key, c)
  }
  return c
}

/** @deprecated single-host client for legacy model-only callers (calibration, role-fallback classification). */
function getClient(): OpenAI {
  const key = groqApiKey()
  if (!key) {
    throw new Error(
      'GROQ_API_KEY is not set. Add it to .env.local for live models; without it Scout runs in demo mode.',
    )
  }
  return clientFor(groqBaseUrl(), key)
}

/**
 * Thrown when the provider keeps answering 429/503 after the retry budget.
 * Callers map this to a friendly "queued, shortly" message instead of a hard
 * failure. The message stays task-neutral (used by extraction, drafting, and
 * classification alike) rather than hardcoding "drafting" for every caller.
 */
export class RateLimitedError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(
      retryAfterSeconds > 0
        ? `queued, shortly. The model provider is rate limited; try again in about ${Math.ceil(retryAfterSeconds)}s.`
        : 'queued, shortly. The model provider is rate limited; try again in a minute.',
    )
    this.name = 'RateLimitedError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/** Thrown when every host in every tier of a chain has failed. */
export class AllTiersFailedError extends Error {
  attempts: Array<{ host: string; tier: CostTier; error: string }>

  constructor(attempts: Array<{ host: string; tier: CostTier; error: string }>) {
    super(
      `Every configured host failed: ${attempts.map((a) => `${a.host} (${a.tier}): ${a.error}`).join('; ')}.`,
    )
    this.name = 'AllTiersFailedError'
    this.attempts = attempts
  }
}

const RATE_LIMIT_STATUSES = new Set([408, 429, 500, 503, 529])

function isRateLimitError(err: unknown): boolean {
  if (RATE_LIMIT_STATUSES.has((err as { status?: number })?.status ?? 0)) {
    return true
  }
  const msg = err instanceof Error ? err.message : String(err)
  return /rate limit|too many requests|overloaded|capacity/i.test(msg)
}

function retryAfterFrom(err: unknown): number | null {
  const headers = (err as { headers?: Record<string, string | undefined> })?.headers
  if (!headers) return null
  const raw = headers['retry-after'] ?? headers['Retry-After']
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isNaN(n)) return n
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Retries a single host with exponential backoff (respecting Retry-After) on
 * rate-limit responses, surfacing a live "queued, shortly" status between
 * attempts. This budget is per-host: once it's exhausted the caller (a chain
 * walker) moves to the next host rather than this function throwing all the
 * way out, except on the very last host in the very last tier, where there's
 * nowhere left to fall through to.
 */
async function withHostRetry<T>(
  label: string,
  onStatus: ((message: string) => void) | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const maxAttempts = 4
  const baseMs = 700
  const maxDelayMs = 12_000
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      const rateLimited = isRateLimitError(err)
      if (!rateLimited) throw err
      const retryAfter = retryAfterFrom(err)
      const delay = Math.min(
        maxDelayMs,
        Math.max((retryAfter ?? 0) * 1000, baseMs * 2 ** attempt, 500),
      )
      attempt += 1
      if (attempt >= maxAttempts) {
        throw new RateLimitedError(retryAfter ?? Math.ceil(delay / 1000))
      }
      if (onStatus) {
        onStatus(`${label}: queued, shortly · waiting ${Math.ceil(delay / 1000)}s (attempt ${attempt})`)
      }
      await sleep(delay + Math.floor(Math.random() * 250))
    }
  }
}

export interface CallResult<T> {
  data: T
  /** Which host actually served the call, for cost/reliability logging. */
  host: string
  costTier: CostTier
  /** Rough cost estimate in USD for this one call. */
  estimatedCostUsd: number
}

/**
 * Walks a chain of hosts in order, calling `attempt` on each. The first host
 * to succeed wins; a host that exhausts its own rate-limit retry budget (or
 * errors outright) is recorded and the walk moves to the next host. Throws
 * AllTiersFailedError only once every host in the chain has failed.
 */
async function walkChain<T>(
  chain: ChainStep[],
  onStatus: ((message: string) => void) | undefined,
  attempt: (step: ChainStep) => Promise<T>,
): Promise<CallResult<T>> {
  if (chain.length === 0) {
    throw new Error('No provider host is configured for this call. Set at least one API key.')
  }
  const failures: Array<{ host: string; tier: CostTier; error: string }> = []
  for (const step of chain) {
    try {
      const data = await withHostRetry(`${step.costTier}:${step.host.id} (${step.host.model})`, onStatus, () =>
        attempt(step),
      )
      return { data, host: step.host.id, costTier: step.costTier, estimatedCostUsd: 0 }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ host: step.host.id, tier: step.costTier, error: message })
      onStatus?.(`${step.host.id} unavailable (${message}); trying next host`)
    }
  }
  throw new AllTiersFailedError(failures)
}

export interface JsonCallOptions {
  system: string
  user: string
  /** Schema definition used by json_schema mode; advisory in json_object mode. */
  schema: Record<string, unknown>
  model?: string
  responseMode?: 'json_object' | 'json_schema'
  schemaName?: string
  strict?: boolean
  /** Emitted during rate-limit backoff and host fallback so the UI can show the queue/fallback state. */
  onStatus?: (message: string) => void
}

function isJsonObjectOut(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
}

async function structuredJsonOnHost<T>(
  host: { apiKey: string | undefined; baseUrl: string; model: string },
  opts: Omit<JsonCallOptions, 'model'>,
): Promise<{ value: T; inputTokens: number; outputTokens: number }> {
  if (!host.apiKey) throw new Error(`Host has no API key configured.`)
  const api = clientFor(host.baseUrl, host.apiKey)
  let user = opts.user
  const responseMode = opts.responseMode ?? 'json_object'
  const responseFormat =
    responseMode === 'json_schema'
      ? {
          type: 'json_schema' as const,
          json_schema: {
            name: opts.schemaName ?? 'scout_schema',
            strict: opts.strict ?? false,
            schema: opts.schema,
          },
        }
      : ({ type: 'json_object' } as const)

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const completion = await api.chat.completions.create({
      model: host.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: user },
      ] satisfies ChatCompletionMessageParam[],
      response_format: responseFormat,
    })
    const raw = completion.choices[0]?.message?.content
    const inputTokens = completion.usage?.prompt_tokens ?? estimateTokens(opts.system + user)
    const outputTokens = completion.usage?.completion_tokens ?? estimateTokens(raw ?? '')
    if (!raw) {
      if (attempt < 2) {
        user = `${user}\n\nYou returned no content. Return ONLY a single JSON object.`
        continue
      }
      throw new Error('Model returned no content.')
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isJsonObjectOut(parsed)) throw new Error('Not a JSON object')
      return { value: parsed as T, inputTokens, outputTokens }
    } catch {
      if (attempt >= 2) {
        throw new Error('Model returned invalid JSON after retries.')
      }
      user = `${user}\n\nYour last response was not valid JSON. Return ONLY a single JSON object, nothing else.`
    }
  }
  throw new Error('Unreachable.')
}

/**
 * Single helper for every structured-output call in the app (legacy
 * single-model path). Supports both json_object and json_schema response
 * modes with retry on invalid JSON. Kept for the calibration and
 * role-fallback classification call sites; new structuring calls should use
 * structuredJsonChain instead.
 */
export async function structuredJson<T>(opts: JsonCallOptions): Promise<T> {
  const model = opts.model
  if (!model) throw new Error('structuredJson requires a model id (legacy path).')
  const api = getClient()
  return await withHostRetry(`Model call (${model})`, opts.onStatus, async () => {
    let user = opts.user
    const responseMode = opts.responseMode ?? 'json_object'
    const responseFormat =
      responseMode === 'json_schema'
        ? {
            type: 'json_schema' as const,
            json_schema: {
              name: opts.schemaName ?? 'scout_schema',
              strict: opts.strict ?? false,
              schema: opts.schema,
            },
          }
        : ({ type: 'json_object' } as const)

    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const completion = await api.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: user },
        ] satisfies ChatCompletionMessageParam[],
        response_format: responseFormat,
      })
      const raw = completion.choices[0]?.message?.content
      if (!raw) {
        if (attempt < 2) {
          user = `${user}\n\nYou returned no content. Return ONLY a single JSON object.`
          continue
        }
        throw new Error('Model returned no content.')
      }
      try {
        const parsed: unknown = JSON.parse(raw)
        if (!isJsonObjectOut(parsed)) throw new Error('Not a JSON object')
        return parsed as T
      } catch {
        if (attempt >= 2) {
          throw new Error('Model returned invalid JSON after retries.')
        }
        user = `${user}\n\nYour last response was not valid JSON. Return ONLY a single JSON object, nothing else.`
      }
    }
    throw new Error('Unreachable.')
  })
}

/**
 * Structured-output call across a full tier chain. Every host is asked for
 * json_object mode, never strict json_schema — DeepSeek's own strict mode has
 * an open, documented bug that returns malformed JSON on some calls, and
 * relying on schema-adherence claims from any provider without verifying is
 * exactly the mistake this app has avoided since the first model-layer pass.
 * The existing client-side validateOutput() check downstream of this
 * function is what actually catches shape drift, on every tier, unconditionally.
 */
export async function structuredJsonChain<T>(
  chain: ChainStep[],
  opts: Omit<JsonCallOptions, 'model' | 'responseMode' | 'strict'>,
): Promise<CallResult<T>> {
  const result = await walkChain(chain, opts.onStatus, async (step) => {
    const { value, inputTokens, outputTokens } = await structuredJsonOnHost<T>(
      { apiKey: step.host.apiKey, baseUrl: step.host.baseUrl, model: step.host.model },
      { ...opts, responseMode: 'json_object' },
    )
    return { value, inputTokens, outputTokens }
  })
  const estimatedCostUsd = estimateCostUsd(
    result.costTier,
    result.data.inputTokens,
    result.data.outputTokens,
  )
  return { data: result.data.value, host: result.host, costTier: result.costTier, estimatedCostUsd }
}

/**
 * Streams a plain-text completion, invoking onChunk with each text delta.
 * Used for the draft pipeline so a rep sees the message appear token by token
 * instead of waiting on a blocking call. Returns the full text. Legacy
 * single-model path; new drafting calls should use streamChatTextChain.
 */
export async function streamChatText(opts: {
  system: string
  user: string
  model?: string
  temperature?: number
  onChunk: (delta: string) => void
  onStatus?: (message: string) => void
}): Promise<string> {
  const model = opts.model
  if (!model) throw new Error('streamChatText requires a model id (legacy path).')
  const api = getClient()

  return await withHostRetry(`Draft (${model})`, opts.onStatus, async () => {
    const stream = await api.chat.completions.create({
      model,
      temperature: opts.temperature ?? 0.7,
      stream: true,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ] satisfies ChatCompletionMessageParam[],
    })

    let full = ''
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? ''
      if (delta) {
        full += delta
        opts.onChunk(delta)
      }
    }
    return full
  })
}

/** Same host-then-tier fallback as structuredJsonChain, for streamed text completions. */
export async function streamChatTextChain(
  chain: ChainStep[],
  opts: {
    system: string
    user: string
    temperature?: number
    onChunk: (delta: string) => void
    onStatus?: (message: string) => void
  },
): Promise<CallResult<string>> {
  const result = await walkChain(chain, opts.onStatus, async (step) => {
    if (!step.host.apiKey) throw new Error('Host has no API key configured.')
    const api = clientFor(step.host.baseUrl, step.host.apiKey)
    const stream = await api.chat.completions.create({
      model: step.host.model,
      temperature: opts.temperature ?? 0.7,
      stream: true,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ] satisfies ChatCompletionMessageParam[],
    })
    let full = ''
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? ''
      if (delta) {
        full += delta
        opts.onChunk(delta)
      }
    }
    return {
      full,
      inputTokens: estimateTokens(opts.system + opts.user),
      outputTokens: estimateTokens(full),
    }
  })
  const estimatedCostUsd = estimateCostUsd(
    result.costTier,
    result.data.inputTokens,
    result.data.outputTokens,
  )
  return { data: result.data.full, host: result.host, costTier: result.costTier, estimatedCostUsd }
}
