/**
 * Observability trace tests (Phase 6).
 *
 * Deterministic: no provider key, no network. Covers the structured failure
 * category, the request-scoped trace context, and the persisted trace fields.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const captured: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: async () => ({
    from: () => ({
      insert: (record: Record<string, unknown>) => {
        captured.push(record)
        return { error: null }
      },
    }),
  }),
}))

import { classifyAiFailure } from '@/lib/ai/runtime/types'
import { persistTrace } from '@/lib/ai/runtime/telemetry'
import { getTraceContext, newRequestId, runWithTraceContext } from '@/lib/observability/trace-context'
import type { AiTrace } from '@/lib/ai/runtime/types'

function trace(overrides: Partial<AiTrace> = {}): AiTrace {
  return {
    taskId: 'task-1',
    taskClass: 'FAST_STRUCTURED',
    provider: 'openai',
    model: 'gpt-test',
    credentialId: 'cred-1',
    attempt: 1,
    inputTokens: 10,
    outputTokens: 20,
    inputChars: 100,
    ttfbMs: 120,
    latencyMs: 400,
    estimatedCostUsd: 0.0001,
    schemaValid: true,
    quality: 'GOOD',
    fallback: false,
    fallbackReason: null,
    error: null,
    timestamp: Date.now(),
    runtimeVersion: 'runtime-v3',
    callSite: 'test',
    feature: 'prospect_analysis',
    leadId: null,
    jobId: null,
    repId: null,
    requestId: null,
    decisionRunId: null,
    failureCategory: null,
    ...overrides,
  }
}

describe('classifyAiFailure', () => {
  it('maps HTTP statuses to stable categories', () => {
    expect(classifyAiFailure(null, 401)).toBe('PROVIDER_AUTH')
    expect(classifyAiFailure(null, 403)).toBe('PROVIDER_AUTH')
    expect(classifyAiFailure(null, 429)).toBe('PROVIDER_RATE_LIMIT')
    expect(classifyAiFailure(null, 408)).toBe('PROVIDER_TIMEOUT')
    expect(classifyAiFailure(null, 504)).toBe('PROVIDER_TIMEOUT')
    expect(classifyAiFailure(null, 400)).toBe('PROVIDER_4XX')
    expect(classifyAiFailure(null, 500)).toBe('PROVIDER_5XX')
  })

  it('maps messages when no status is available', () => {
    expect(classifyAiFailure('request timed out')).toBe('PROVIDER_TIMEOUT')
    expect(classifyAiFailure('rate limit exceeded')).toBe('PROVIDER_RATE_LIMIT')
    expect(classifyAiFailure('invalid api key')).toBe('PROVIDER_AUTH')
    expect(classifyAiFailure('JSON parse error')).toBe('SCHEMA_INVALID')
    expect(classifyAiFailure('fetch failed')).toBe('NETWORK_ERROR')
    expect(classifyAiFailure('The operation was aborted')).toBe('CANCELLED')
    expect(classifyAiFailure('cache miss failure')).toBe('CACHE_FAILURE')
    expect(classifyAiFailure('s3 upload failed')).toBe('STORAGE_FAILURE')
    expect(classifyAiFailure('quality blocked')).toBe('QUALITY_BLOCKED')
    expect(classifyAiFailure('validation failed')).toBe('VALIDATION_FAILED')
    expect(classifyAiFailure('')).toBe('UNKNOWN')
    expect(classifyAiFailure('something odd')).toBe('UNKNOWN')
  })
})

describe('trace context', () => {
  it('a new request id is a non-empty unique id', () => {
    const a = newRequestId()
    const b = newRequestId()
    expect(a.length).toBeGreaterThan(10)
    expect(a).not.toBe(b)
  })

  it('the context is visible to nested calls and absent outside them', () => {
    expect(getTraceContext()).toBeUndefined()
    const seen = runWithTraceContext({ requestId: 'req-1', leadId: 'lead-1' }, () => getTraceContext())
    expect(seen).toEqual({ requestId: 'req-1', leadId: 'lead-1' })
    expect(getTraceContext()).toBeUndefined()
  })
})

describe('persistTrace', () => {
  beforeEach(() => {
    captured.length = 0
  })

  it('persists the correlation ids and the structured failure category', async () => {
    await persistTrace(
      trace({
        requestId: 'req-1',
        leadId: 'lead-1',
        decisionRunId: 'run-1',
        error: 'request timed out',
        failureCategory: classifyAiFailure('request timed out'),
      }),
      'org-1',
    )
    expect(captured).toHaveLength(1)
    const row = captured[0]
    expect(row.organization_id).toBe('org-1')
    expect(row.request_id).toBe('req-1')
    expect(row.lead_id).toBe('lead-1')
    expect(row.decision_run_id).toBe('run-1')
    expect(row.failure_category).toBe('PROVIDER_TIMEOUT')
    // The raw error is kept separately from the category.
    expect(row.error).toBe('request timed out')
  })

  it('a success carries no failure category', async () => {
    await persistTrace(trace({ requestId: 'req-2' }), 'org-1')
    expect(captured[0].failure_category).toBeNull()
    expect(captured[0].request_id).toBe('req-2')
  })

  it('never persists raw source text or client messages', async () => {
    await persistTrace(trace({ requestId: 'req-3', feature: 'prospect_analysis' }), 'org-1')
    const serialized = JSON.stringify(captured[0])
    expect(serialized).not.toMatch(/rawText|raw_input|sent_text|draft_text|email|phone/i)
  })
})
