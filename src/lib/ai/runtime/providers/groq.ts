/**
 * AI Runtime V3 — Groq Provider Adapter
 *
 * High-speed inference via Groq's LPU.
 * Primary provider for fast interactive tasks.
 */

import type { ProviderModel, JsonCallParams, TextCallParams, ProviderResult } from '../types'
import { recordSuccess, recordFailure } from '../health'
import { normalizeJson, coerceNullStrings } from '../normalize'

// ── Configuration ────────────────────────────────────────────────────────────

interface GroqCredential {
  id: string
  apiKey: string
  baseUrl: string
}

function getCredentials(): GroqCredential[] {
  const creds: GroqCredential[] = []
  const primary = process.env.GROQ_API_KEY
  if (primary) {
    creds.push({ id: 'groq-primary', apiKey: primary, baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1' })
  }
  // Second key only if explicitly configured AND confirmed to return compatible schema
  const secondary = process.env.GROQ_API_KEY_2
  if (secondary && process.env.GROQ_ENABLE_KEY_2 === '1') {
    creds.push({ id: 'groq-secondary', apiKey: secondary, baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1' })
  }
  return creds
}

// ── Models ────────────────────────────────────────────────────────────────────

export const GROQ_MODELS: Record<string, ProviderModel> = {
  'gpt-oss-20b': {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    baseUrl: 'https://api.groq.com/openai/v1',
    costPerInputToken: 0,
    costPerOutputToken: 0,
    supportsStreaming: true,
    supportsJsonSchema: false,
    maxContextTokens: 128_000,
  },
  'gpt-oss-120b': {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1',
    costPerInputToken: 0,
    costPerOutputToken: 0,
    supportsStreaming: true,
    supportsJsonSchema: false,
    maxContextTokens: 128_000,
  },
}

export function resolveModel(modelId?: string): ProviderModel {
  const id = modelId || process.env.GROQ_DEFAULT_MODEL || 'gpt-oss-120b'
  return GROQ_MODELS[id] || GROQ_MODELS['gpt-oss-120b']
}

function selectCredential(): GroqCredential | null {
  return getCredentials()[0] || null
}

// ── JSON Call ────────────────────────────────────────────────────────────────

export async function callJson<T>(
  model: ProviderModel,
  params: JsonCallParams,
  timeoutMs: number,
): Promise<ProviderResult<T>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No Groq API key configured')

  const url = cred.baseUrl.replace(/\/$/, '') + '/chat/completions'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  const t0 = Date.now()
  let ttfb: number | null = null

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cred.apiKey}` },
      body: JSON.stringify({
        model: model.model,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        response_format: { type: 'json_object' },
        max_tokens: params.maxTokens || 1024,
        temperature: params.temperature ?? 0.1,
      }),
      signal: ac.signal,
    })

    ttfb = Date.now() - t0

    if (!response.ok) {
      const status = response.status
      const failureType = status === 429 ? 'rate_limit' : 'error'
      recordFailure(model.provider, model.model, cred.id, failureType, Date.now() - t0)

      if (status === 429) throw new RateLimitedError()
      throw new Error(`Groq ${status}`)
    }

    const body = await response.json()
    const content = body.choices?.[0]?.message?.content
    const inputTokens = body.usage?.prompt_tokens || 0
    const outputTokens = body.usage?.completion_tokens || 0
    const latencyMs = Date.now() - t0

    if (!content) {
      recordFailure(model.provider, model.model, cred.id, 'malformed', latencyMs)
      throw new Error('Groq returned empty content')
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

// ── Text Call ────────────────────────────────────────────────────────────────

export async function callText(
  model: ProviderModel,
  params: TextCallParams,
  timeoutMs: number,
): Promise<ProviderResult<string>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No Groq API key configured')

  const url = cred.baseUrl.replace(/\/$/, '') + '/chat/completions'
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  const t0 = Date.now()
  let ttfb: number | null = null
  let full = ''

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cred.apiKey}` },
      body: JSON.stringify({
        model: model.model,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        max_tokens: params.maxTokens || 2048,
        temperature: params.temperature ?? 0.7,
        stream: true,
      }),
      signal: ac.signal,
    })

    if (!response.ok) {
      const failureType = response.status === 429 ? 'rate_limit' : 'error'
      recordFailure(model.provider, model.model, cred.id, failureType, Date.now() - t0)
      if (response.status === 429) throw new RateLimitedError()
      throw new Error(`Groq ${response.status}`)
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
            const delta = json.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              full += delta
              params.onChunk?.(delta)
            }
          } catch {
            // Skip
          }
        }
      }
    }

    const latencyMs = Date.now() - t0
    recordSuccess(model.provider, model.model, cred.id, latencyMs)

    return {
      data: full,
      provider: model.provider,
      model: model.model,
      credentialId: cred.id,
      latencyMs,
      ttfbMs: ttfb,
      inputTokens: 0,
      outputTokens: 0,
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

export class RateLimitedError extends Error {
  constructor() {
    super('Groq rate limited (429)')
    this.name = 'RateLimitedError'
  }
}

export function hasGroq(): boolean {
  return getCredentials().length > 0
}
