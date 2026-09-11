import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

import { cheapModel, groqApiKey, groqBaseUrl } from '@/lib/ai/config'

/**
 * The single model provider. All calls go through Groq's OpenAI-compatible
 * API. Structured output uses JSON object mode (Llama models do not support
 * Groq's strict json_schema), so callers stay tolerant of shape drift and
 * invalid JSON gets retried here.
 */

let client: OpenAI | null = null
let clientKey = ''
let clientBase = ''

function getClient(): OpenAI {
  const key = groqApiKey()
  if (!key) {
    throw new Error(
      'GROQ_API_KEY is not set. Add it to .env.local for live models; without it Scout runs in demo mode.',
    )
  }
  const baseURL = groqBaseUrl()
  if (!client || clientKey !== key || clientBase !== baseURL) {
    client = new OpenAI({ apiKey: key, baseURL })
    clientKey = key
    clientBase = baseURL
  }
  return client
}

/**
 * Thrown when the provider keeps answering 429/503 after the retry budget.
 * The draft route maps this to a friendly "queued, drafting shortly" message
 * instead of a hard failure.
 */
export class RateLimitedError extends Error {
  retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super(
      retryAfterSeconds > 0
        ? `queued, drafting shortly. The model provider is rate limited; try again in about ${Math.ceil(retryAfterSeconds)}s.`
        : 'queued, drafting shortly. The model provider is rate limited; try again in a minute.',
    )
    this.name = 'RateLimitedError'
    this.retryAfterSeconds = retryAfterSeconds
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
 * Free-tier Groq limits are per-minute RPM. A burst across reps can hit 429 or
 * 503. Instead of failing the draft, wait with exponential backoff (respecting
 * Retry-After) and surface a live "queued, drafting shortly" status between
 * attempts. After the budget the queue state is reported as an error, never a
 * silent drop.
 */
async function withRateLimitFallback<T>(
  label: string,
  onStatus: ((message: string) => void) | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const maxAttempts = 6
  const baseMs = 900
  const maxDelayMs = 20_000
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
        onStatus(
          `${label}: queued, drafting shortly · waiting ${Math.ceil(delay / 1000)}s (attempt ${attempt})`,
        )
      }
      await sleep(delay + Math.floor(Math.random() * 250))
    }
  }
}

export interface JsonCallOptions {
  system: string
  user: string
  /** Schema is advisory; JSON object mode cannot enforce it. */
  schema: Record<string, unknown>
  model?: string
  /** Emitted during rate-limit backoff so the UI can show the queue state. */
  onStatus?: (message: string) => void
}

function isJsonObjectOut(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
}

/**
 * Single helper for every structured-output call in the app. Uses JSON object
 * mode (Llama models reject strict json_schema) and validates the shape as
 * best it can, retrying once when the model returns invalid JSON.
 */
export async function structuredJson<T>(
  opts: JsonCallOptions,
): Promise<T> {
  const model = opts.model ?? cheapModel()
  const api = getClient()
  const system = opts.system
  let user = opts.user

  return await withRateLimitFallback(`Model call (${model})`, opts.onStatus, async () => {
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const completion = await api.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ] satisfies ChatCompletionMessageParam[],
        response_format: { type: 'json_object' },
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
 * Streams a plain-text completion, invoking onChunk with each text delta.
 * Used for the draft pipeline so a rep sees the message appear token by token
 * instead of waiting on a blocking call. Returns the full text.
 */
export async function streamChatText(opts: {
  system: string
  user: string
  model?: string
  temperature?: number
  onChunk: (delta: string) => void
  onStatus?: (message: string) => void
}): Promise<string> {
  const model = opts.model ?? cheapModel()
  const api = getClient()

  return await withRateLimitFallback(`Draft (${model})`, opts.onStatus, async () => {
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