/**
 * AI Runtime V3 — OpenAI Provider Adapter
 *
 * Reliability/premium safety net.
 * Used when cheaper providers fail or for difficult tasks.
 */

import type { ProviderModel, JsonCallParams, TextCallParams, ProviderResult } from '../types'
import { recordSuccess, recordFailure } from '../health'
import { normalizeJson, coerceNullStrings } from '../normalize'
import { TIER_REGISTRY, type IntelligenceTier } from '../model-router'

interface OpenAiCredential {
  id: string
  apiKey: string
  baseUrl: string
}

function getCredentials(): OpenAiCredential[] {
  const creds: OpenAiCredential[] = []
  const primary = process.env.OPENAI_API_KEY
  if (primary) {
    creds.push({
      id: 'openai-primary',
      apiKey: primary,
      baseUrl: process.env.OPENAI_CHAT_BASE_URL || 'https://api.openai.com/v1',
    })
  }
  return creds
}

function makeModel(modelId: string, inputCost: number, outputCost: number): ProviderModel {
  return {
    provider: 'openai',
    model: modelId,
    baseUrl: process.env.OPENAI_CHAT_BASE_URL || 'https://api.openai.com/v1',
    costPerInputToken: inputCost,
    costPerOutputToken: outputCost,
    supportsStreaming: true,
    supportsJsonSchema: true,
    maxContextTokens: 128_000,
  }
}

export const OPENAI_MODELS: Record<string, ProviderModel> = {
  'gpt-4o-mini': makeModel('gpt-4o-mini', 0.15, 0.60),
  'gpt-4o': makeModel('gpt-4o', 2.50, 10.00),
  // Intelligence tiers — model ids are env-overridable via model-router registry
  luna: makeModel(TIER_REGISTRY.luna.modelId, TIER_REGISTRY.luna.costPerInputToken, TIER_REGISTRY.luna.costPerOutputToken),
  terra: makeModel(TIER_REGISTRY.terra.modelId, TIER_REGISTRY.terra.costPerInputToken, TIER_REGISTRY.terra.costPerOutputToken),
  sol: makeModel(TIER_REGISTRY.sol.modelId, TIER_REGISTRY.sol.costPerInputToken, TIER_REGISTRY.sol.costPerOutputToken),
}

export function resolveModel(modelId?: string): ProviderModel {
  const id = modelId || process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini'
  return OPENAI_MODELS[id] || OPENAI_MODELS['gpt-4o-mini']
}

/** Resolve model by intelligence tier — used by the runtime router */
export function resolveModelForTier(tier: IntelligenceTier): ProviderModel {
  return OPENAI_MODELS[tier] || OPENAI_MODELS['gpt-4o-mini']
}

function selectCredential(): OpenAiCredential | null {
  return getCredentials()[0] || null
}

export async function callJson<T>(
  model: ProviderModel,
  params: JsonCallParams,
  timeoutMs: number,
): Promise<ProviderResult<T>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No OpenAI API key configured')

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
      const failureType = response.status === 429 ? 'rate_limit' : 'error'
      recordFailure(model.provider, model.model, cred.id, failureType, Date.now() - t0)
      if (response.status === 429) throw new RateLimitedError()
      throw new Error(`OpenAI ${response.status}`)
    }

    const body = await response.json()
    const content = body.choices?.[0]?.message?.content
    const inputTokens = body.usage?.prompt_tokens || 0
    const outputTokens = body.usage?.completion_tokens || 0
    const latencyMs = Date.now() - t0

    if (!content) {
      recordFailure(model.provider, model.model, cred.id, 'malformed', latencyMs)
      throw new Error('OpenAI returned empty content')
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

export async function callText(
  model: ProviderModel,
  params: TextCallParams,
  timeoutMs: number,
): Promise<ProviderResult<string>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No OpenAI API key configured')

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
      throw new Error(`OpenAI ${response.status}`)
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
    const inputTokens = 0
    const outputTokens = 0
    recordSuccess(model.provider, model.model, cred.id, latencyMs)

    return {
      data: full,
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

export class RateLimitedError extends Error {
  constructor() {
    super('OpenAI rate limited (429)')
    this.name = 'RateLimitedError'
  }
}

export function hasOpenAi(): boolean {
  return getCredentials().length > 0
}
