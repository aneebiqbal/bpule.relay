/**
 * AI Runtime V3 — OpenCode Go Provider Adapter
 *
 * OpenCode Go is a $10/month subscription providing access to 30+ models
 * through a unified API. Base URL: https://opencode.ai/zen/go/v1
 *
 * Key requirements:
 * - x-opencode-session header (stable session ID for routing)
 * - User-Agent identifying the client
 * - Model IDs WITHOUT the opencode-go/ prefix in API calls
 *
 * Endpoint types per model family:
 * - /chat/completions — OpenAI-compatible (GLM, Kimi, DeepSeek, LongCat, Hy)
 * - /messages — Anthropic-compatible (Qwen, MiniMax, Muse)
 * - /responses — OpenAI Responses API (GPT, Grok)
 */

import type { ProviderModel, JsonCallParams, TextCallParams, ProviderResult } from '../types'
import { recordSuccess, recordFailure } from '../health'
import { normalizeJson, coerceNullStrings } from '../normalize'

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://opencode.ai/zen/go/v1'

interface OpenCodeCredential {
  id: string
  apiKey: string
  baseUrl: string
}

function getCredentials(): OpenCodeCredential[] {
  const creds: OpenCodeCredential[] = []
  const primary = process.env.OPENCODE_API_KEY
  if (primary) {
    creds.push({
      id: 'opencode-primary',
      apiKey: primary,
      baseUrl: process.env.OPENCODE_BASE_URL || DEFAULT_BASE_URL,
    })
  }
  return creds
}

// ── Model Endpoint Classification ────────────────────────────────────────────
/**
 * OpenCode Go models use different endpoints based on their provider family.
 * We classify them to route to the correct endpoint.
 */

type EndpointType = 'chat_completions' | 'messages' | 'responses'

interface OpenCodeModelInfo {
  endpoint: EndpointType
  costPerInputToken: number
  costPerOutputToken: number
  maxContextTokens: number
}

const OPENCODE_MODEL_INFO: Record<string, OpenCodeModelInfo> = {
  // Chat completions (OpenAI-compatible)
  'glm-5.3-flash': { endpoint: 'chat_completions', costPerInputToken: 0.15, costPerOutputToken: 0.50, maxContextTokens: 128_000 },
  'glm-5.3': { endpoint: 'chat_completions', costPerInputToken: 1.40, costPerOutputToken: 4.40, maxContextTokens: 128_000 },
  'glm-5.2': { endpoint: 'chat_completions', costPerInputToken: 1.40, costPerOutputToken: 4.40, maxContextTokens: 128_000 },
  'glm-5.1': { endpoint: 'chat_completions', costPerInputToken: 1.40, costPerOutputToken: 4.40, maxContextTokens: 128_000 },
  'glm-5': { endpoint: 'chat_completions', costPerInputToken: 1.40, costPerOutputToken: 4.40, maxContextTokens: 128_000 },
  'kimi-k3': { endpoint: 'chat_completions', costPerInputToken: 3.00, costPerOutputToken: 15.00, maxContextTokens: 128_000 },
  'kimi-k2.7-code': { endpoint: 'chat_completions', costPerInputToken: 0.95, costPerOutputToken: 4.00, maxContextTokens: 128_000 },
  'kimi-k2.6': { endpoint: 'chat_completions', costPerInputToken: 0.95, costPerOutputToken: 4.00, maxContextTokens: 128_000 },
  'longcat-2.0': { endpoint: 'chat_completions', costPerInputToken: 0.30, costPerOutputToken: 1.20, maxContextTokens: 1_000_000 },
  'deepseek-v4.1-flash': { endpoint: 'chat_completions', costPerInputToken: 0.15, costPerOutputToken: 0.60, maxContextTokens: 128_000 },
  'deepseek-v4-pro': { endpoint: 'chat_completions', costPerInputToken: 0.66, costPerOutputToken: 1.98, maxContextTokens: 128_000 },
  'deepseek-v4-flash': { endpoint: 'chat_completions', costPerInputToken: 0.15, costPerOutputToken: 0.60, maxContextTokens: 128_000 },
  'deepseek-v4-flash-vision-exp': { endpoint: 'chat_completions', costPerInputToken: 0.15, costPerOutputToken: 0.60, maxContextTokens: 128_000 },
  'deepseek-flash': { endpoint: 'chat_completions', costPerInputToken: 0.15, costPerOutputToken: 0.60, maxContextTokens: 128_000 },
  'hy4-preview': { endpoint: 'chat_completions', costPerInputToken: 0.834, costPerOutputToken: 2.501, maxContextTokens: 128_000 },
  'hy3': { endpoint: 'chat_completions', costPerInputToken: 0.14, costPerOutputToken: 0.58, maxContextTokens: 128_000 },

  // Messages (Anthropic-compatible)
  'qwen3.8-flash': { endpoint: 'messages', costPerInputToken: 0.15, costPerOutputToken: 0.47, maxContextTokens: 128_000 },
  'qwen3.8-max': { endpoint: 'messages', costPerInputToken: 2.00, costPerOutputToken: 6.00, maxContextTokens: 128_000 },
  'qwen3.7-max': { endpoint: 'messages', costPerInputToken: 2.50, costPerOutputToken: 7.50, maxContextTokens: 128_000 },
  'qwen3.7-plus': { endpoint: 'messages', costPerInputToken: 0.40, costPerOutputToken: 1.60, maxContextTokens: 128_000 },
  'qwen3.6-plus': { endpoint: 'messages', costPerInputToken: 0.50, costPerOutputToken: 3.00, maxContextTokens: 128_000 },
  'minimax-m3': { endpoint: 'messages', costPerInputToken: 0.30, costPerOutputToken: 1.20, maxContextTokens: 128_000 },
  'minimax-m2.7': { endpoint: 'messages', costPerInputToken: 0.30, costPerOutputToken: 1.20, maxContextTokens: 128_000 },
  'mimo-v2.5': { endpoint: 'messages', costPerInputToken: 0.14, costPerOutputToken: 0.28, maxContextTokens: 128_000 },
  'mimo-v2.5-pro': { endpoint: 'messages', costPerInputToken: 0.435, costPerOutputToken: 0.87, maxContextTokens: 128_000 },
  'muse-spark-1.3-contributor': { endpoint: 'messages', costPerInputToken: 0.10, costPerOutputToken: 0.20, maxContextTokens: 128_000 },

  // Responses (OpenAI Responses API)
  'gpt-5.6-luna': { endpoint: 'responses', costPerInputToken: 0.20, costPerOutputToken: 1.20, maxContextTokens: 128_000 },
  'grok-4.6': { endpoint: 'responses', costPerInputToken: 2.00, costPerOutputToken: 6.00, maxContextTokens: 128_000 },
}

// Models that support json_object response format (chat_completions only)
const JSON_COMPATIBLE_MODELS = new Set([
  'glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-5',
  'kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6',
  'longcat-2.0',
  'deepseek-v4.1-flash', 'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-flash',
  'hy4-preview', 'hy3',
])

export const OPENCODE_MODELS: Record<string, ProviderModel> = {}
for (const [id, info] of Object.entries(OPENCODE_MODEL_INFO)) {
  OPENCODE_MODELS[id] = {
    provider: 'opencode',
    model: id,
    baseUrl: DEFAULT_BASE_URL,
    costPerInputToken: info.costPerInputToken,
    costPerOutputToken: info.costPerOutputToken,
    supportsStreaming: true,
    supportsJsonSchema: JSON_COMPATIBLE_MODELS.has(id),
    maxContextTokens: info.maxContextTokens,
  }
}

export function getDefaultModel(): string {
  return process.env.OPENCODE_DEFAULT_MODEL || 'glm-5.3-flash'
}

export function resolveModel(modelId?: string): ProviderModel {
  const id = modelId || getDefaultModel()
  return OPENCODE_MODELS[id] || OPENCODE_MODELS[getDefaultModel()]
}

function getModelEndpoint(modelId: string): EndpointType {
  return OPENCODE_MODEL_INFO[modelId]?.endpoint || 'chat_completions'
}

function supportsJson(modelId: string): boolean {
  return JSON_COMPATIBLE_MODELS.has(modelId)
}

// ── Credential Selection ─────────────────────────────────────────────────────

function selectCredential(): OpenCodeCredential | null {
  return getCredentials()[0] || null
}

function getSessionHeader(): string {
  return process.env.OPENCODE_SESSION_ID || 'relay-ai-runtime-v3'
}

// ── JSON Call (Chat Completions) ────────────────────────────────────────────

export async function callJson<T>(
  model: ProviderModel,
  params: JsonCallParams,
  timeoutMs: number,
): Promise<ProviderResult<T>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No OpenCode Go API key configured')

  const endpoint = getModelEndpoint(model.model)
  if (endpoint !== 'chat_completions') {
    throw new Error(`Model ${model.model} uses ${endpoint} endpoint, not chat_completions`)
  }

  const url = cred.baseUrl.replace(/\/$/, '') + '/chat/completions'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  const t0 = Date.now()
  let ttfb: number | null = null

  try {
    const body: Record<string, unknown> = {
      model: model.model,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      max_tokens: params.maxTokens || 1024,
      temperature: params.temperature ?? 0.1,
    }
    if (supportsJson(model.model)) {
      body.response_format = { type: 'json_object' }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cred.apiKey}`,
        'x-opencode-session': getSessionHeader(),
        'User-Agent': 'relay-ai/1.0',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })

    ttfb = Date.now() - t0

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      recordFailure(model.provider, model.model, cred.id, response.status === 429 ? 'rate_limit' : 'error', Date.now() - t0)
      if (response.status === 429) throw new RateLimitedError()
      throw new Error(`OpenCode Go ${response.status}: ${errorText.slice(0, 200)}`)
    }

    const json = await response.json()

    // Handle error responses (OpenCode Go returns 200 with error body)
    if (json.type === 'error') {
      recordFailure(model.provider, model.model, cred.id, 'error', Date.now() - t0)
      throw new Error(`OpenCode Go error: ${json.error?.message || 'Unknown error'}`)
    }

    // Some models (kimi, hy) put output in reasoning_content instead of content
    const msg = json.choices?.[0]?.message
    const content = msg?.content || msg?.reasoning_content
    const inputTokens = json.usage?.prompt_tokens || 0
    const outputTokens = json.usage?.completion_tokens || 0
    const latencyMs = Date.now() - t0

    if (!content) {
      recordFailure(model.provider, model.model, cred.id, 'malformed', latencyMs)
      throw new Error('OpenCode Go returned empty content')
    }

    const parsed = normalizeJson(content)
    const coerced = coerceNullStrings(parsed)
    recordSuccess(model.provider, model.model, cred.id, latencyMs)

    return {
      data: coerced as T,
      provider: model.provider,
      model: model.model,
      credentialId: cred.id,
      latencyMs,
      ttfbMs: ttfb,
      inputTokens,
      outputTokens,
      estimatedCostUsd: (inputTokens * model.costPerInputToken + outputTokens * model.costPerOutputToken) / 1_000_000,
      attempt: 1,
      fallback: false,
      fallbackReason: null,
    }
  } catch (err) {
    clearTimeout(timer)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── Text Call (Streaming) ───────────────────────────────────────────────────

export async function callText(
  model: ProviderModel,
  params: TextCallParams,
  timeoutMs: number,
): Promise<ProviderResult<string>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No OpenCode Go API key configured')

  const endpoint = getModelEndpoint(model.model)
  const url = cred.baseUrl.replace(/\/$/, '') + `/${endpoint === 'chat_completions' ? 'chat/completions' : endpoint}`

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  const t0 = Date.now()
  let ttfb: number | null = null
  let full = ''

  try {
    const body: Record<string, unknown> = {
      model: model.model,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      max_tokens: params.maxTokens || 2048,
      temperature: params.temperature ?? 0.7,
      stream: true,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cred.apiKey}`,
        'x-opencode-session': getSessionHeader(),
        'User-Agent': 'relay-ai/1.0',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    })

    if (!response.ok) {
      const failureType = response.status === 429 ? 'rate_limit' : 'error'
      recordFailure(model.provider, model.model, cred.id, failureType, Date.now() - t0)
      if (response.status === 429) throw new RateLimitedError()
      throw new Error(`OpenCode Go ${response.status}`)
    }

    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      ttfb = ttfb || Date.now() - t0
      const chunk = decoder.decode(value, { stream: true })

      const lines = chunk.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content ?? json.delta?.text ?? ''
            if (delta) {
              full += delta
              params.onChunk?.(delta)
            }
          } catch {
            // Skip malformed frames
          }
        }
      }
    }

    const latencyMs = Date.now() - t0
    const outputTokens = 0 // Streaming usage may not be available

    recordSuccess(model.provider, model.model, cred.id, latencyMs)

    return {
      data: full,
      provider: model.provider,
      model: model.model,
      credentialId: cred.id,
      latencyMs,
      ttfbMs: ttfb,
      inputTokens: 0,
      outputTokens,
      estimatedCostUsd: 0,
      attempt: 1,
      fallback: false,
      fallbackReason: null,
    }
  } catch (err) {
    clearTimeout(timer)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class RateLimitedError extends Error {
  constructor() {
    super('OpenCode Go rate limited (429)')
    this.name = 'RateLimitedError'
  }
}

export function hasOpenCode(): boolean {
  return getCredentials().length > 0
}
