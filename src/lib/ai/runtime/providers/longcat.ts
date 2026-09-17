/**
 * AI Runtime V3 — LongCat Provider Adapter
 *
 * LongCat 2.0 — Meituan MoE model (1.6T total / ~48B active).
 *
 * IMPORTANT: LongCat is a reasoning model. For structured extraction (json_object),
 * it burns all tokens on internal reasoning and returns empty content.
 *
 * Use LongCat ONLY for:
 * - Background/batch intelligence tasks
 * - Deep analysis where latency doesn't matter
 * - Large context synthesis
 * - Tasks where benchmark proves it performs well
 *
 * NEVER use LongCat for:
 * - Interactive extraction
 * - Classification
 * - Connection notes
 * - DMs/Replies
 */

import type { ProviderModel, JsonCallParams, TextCallParams, ProviderResult } from '../types'
import { recordSuccess, recordFailure } from '../health'
import { normalizeJson, coerceNullStrings } from '../normalize'

interface LongCatCredential {
  id: string
  apiKey: string
  baseUrl: string
}

function getCredentials(): LongCatCredential[] {
  const creds: LongCatCredential[] = []
  const primary = process.env.LONGCAT_API_KEY
  if (primary) {
    creds.push({
      id: 'longcat-primary',
      apiKey: primary,
      baseUrl: process.env.LONGCAT_BASE_URL || 'https://api.longcat.chat/openai/v1',
    })
  }
  return creds
}

export const LONGCAT_MODELS: Record<string, ProviderModel> = {
  'LongCat-2.0': {
    provider: 'longcat',
    model: 'LongCat-2.0',
    baseUrl: 'https://api.longcat.chat/openai/v1',
    costPerInputToken: 0,
    costPerOutputToken: 0,
    supportsStreaming: true,
    supportsJsonSchema: false,
    maxContextTokens: 1_000_000,
  },
}

export function resolveModel(modelId?: string): ProviderModel {
  const id = modelId || process.env.LONGCAT_MODEL || 'LongCat-2.0'
  return LONGCAT_MODELS[id] || LONGCAT_MODELS['LongCat-2.0']
}

function selectCredential(): LongCatCredential | null {
  return getCredentials()[0] || null
}

export async function callJson<T>(
  model: ProviderModel,
  params: JsonCallParams,
  timeoutMs: number,
): Promise<ProviderResult<T>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No LongCat API key configured')

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
        max_tokens: params.maxTokens || 2048,
        temperature: params.temperature ?? 0.1,
      }),
      signal: ac.signal,
    })

    ttfb = Date.now() - t0

    if (!response.ok) {
      const failureType = response.status === 429 ? 'rate_limit' : 'error'
      recordFailure(model.provider, model.model, cred.id, failureType, Date.now() - t0)
      if (response.status === 429) throw new RateLimitedError()
      throw new Error(`LongCat ${response.status}`)
    }

    const body = await response.json()
    const content = body.choices?.[0]?.message?.content
    const inputTokens = body.usage?.prompt_tokens || 0
    const outputTokens = body.usage?.completion_tokens || 0
    const latencyMs = Date.now() - t0

    // LongCat often returns empty content for json_object mode (reasoning model quirk)
    if (!content || content.trim().length === 0) {
      recordFailure(model.provider, model.model, cred.id, 'malformed', latencyMs)
      throw new Error('LongCat returned empty content (reasoning model — use text mode or different provider)')
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

export async function callText(
  model: ProviderModel,
  params: TextCallParams,
  timeoutMs: number,
): Promise<ProviderResult<string>> {
  const cred = selectCredential()
  if (!cred) throw new Error('No LongCat API key configured')

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
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature ?? 0.7,
        stream: true,
      }),
      signal: ac.signal,
    })

    if (!response.ok) {
      const failureType = response.status === 429 ? 'rate_limit' : 'error'
      recordFailure(model.provider, model.model, cred.id, failureType, Date.now() - t0)
      if (response.status === 429) throw new RateLimitedError()
      throw new Error(`LongCat ${response.status}`)
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
    super('LongCat rate limited (429)')
    this.name = 'RateLimitedError'
  }
}

export function hasLongCat(): boolean {
  return getCredentials().length > 0
}
