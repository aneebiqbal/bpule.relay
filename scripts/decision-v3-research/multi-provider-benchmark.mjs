/**
 * Multi-Provider Benchmark Harness — V3 Validation
 *
 * Runs identical normalized OpportunityEpisode inputs through all providers.
 * Same bounded questions and option wording for every provider.
 *
 * Providers:
 * - deterministic_v3 (always available)
 * - openai_structured (requires OPENAI_API_KEY)
 * - longcat_structured (requires LONGCAT_API_KEY)
 * - jev (requires JEV_API_KEY)
 * - kev_4b (requires KEV_ENDPOINT)
 *
 * Output: audit-reports/decision-v3/PROVIDER_BENCHMARK.csv
 */

import { FROZEN_EVAL_SET } from '../frozen-eval-data.mjs'
import {
  deterministicDecide,
  normalizeForProvider,
  type NormalizedInput,
} from './normalize-input.mjs'

// ── Provider Interface ────────────────────────────────────────────────────────

interface ProviderResult {
  providerId: string
  relationship: string
  buyerRequestProbability: number
  buyerRequest: string          // EXPLICIT/STRONG/WEAK/NONE (derived from probability)
  needOwner: string
  timing: string
  fit: string
  access: string
  messageEligible: number
  confidence: number
  latencyMs: number
  error: string | null
}

interface Provider {
  id: string
  isAvailable(): boolean
  decide(input: NormalizedInput): Promise<ProviderResult>
}

// ── Deterministic V3 Provider ────────────────────────────────────────────────

const deterministicProvider: Provider = {
  id: 'deterministic_v3',
  isAvailable: () => true,
  decide: async (input: NormalizedInput): Promise<ProviderResult> => {
    const start = performance.now()
    const result = deterministicDecide(input.rawText)
    const latency = performance.now() - start

    return {
      providerId: deterministicProvider.id,
      relationship: result.relationship,
      buyerRequestProbability: result.buyerRequestProbability,
      buyerRequest: probabilityToLabel(result.buyerRequestProbability),
      needOwner: result.needOwner,
      timing: result.timing,
      fit: result.fit,
      access: result.access,
      messageEligible: result.messageEligible,
      confidence: result.confidence,
      latencyMs: Math.round(latency * 100) / 100,
      error: null,
    }
  },
}

// ── OpenAI Structured Provider ────────────────────────────────────────────────

const openaiProvider: Provider = {
  id: 'openai_structured',
  isAvailable: () => !!process.env.OPENAI_API_KEY,
  decide: async (input: NormalizedInput): Promise<ProviderResult> => {
    const start = performance.now()

    if (!process.env.OPENAI_API_KEY) {
      return errorResult('openai_structured', 'OPENAI_API_KEY not set', start)
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.V3_OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: V3_DECISION_SYSTEM_PROMPT },
            { role: 'user', content: buildDecisionPrompt(input) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'v3_decision',
              schema: V3_DECISION_SCHEMA,
              strict: true,
            },
          },
          temperature: 0.1,
          max_tokens: 300,
        }),
      })

      if (!response.ok) {
        return errorResult('openai_structured', `HTTP ${response.status}`, start)
      }

      const data = await response.json() as any
      const content = data.choices?.[0]?.message?.content
      if (!content) return errorResult('openai_structured', 'empty response', start)

      const parsed = JSON.parse(content)
      const latency = performance.now() - start

      return {
        providerId: 'openai_structured',
        relationship: validateRelationship(parsed.relationship),
        buyerRequestProbability: clamp(parsed.buyerRequestProbability),
        buyerRequest: probabilityToLabel(clamp(parsed.buyerRequestProbability)),
        needOwner: validateNeedOwner(parsed.needOwner),
        timing: validateTiming(parsed.timing),
        fit: validateFit(parsed.fit),
        access: validateAccess(parsed.access),
        messageEligible: clamp(parsed.messageEligible),
        confidence: clamp(parsed.confidence ?? (1 - 2 * Math.abs(clamp(parsed.buyerRequestProbability) - 0.5))),
        latencyMs: Math.round(latency * 100) / 100,
        error: null,
      }
    } catch (e) {
      return errorResult('openai_structured', String(e), start)
    }
  },
}

// ── LongCat Structured Provider ───────────────────────────────────────────────

const longcatProvider: Provider = {
  id: 'longcat_structured',
  isAvailable: () => !!process.env.LONGCAT_API_KEY,
  decide: async (input: NormalizedInput): Promise<ProviderResult> => {
    const start = performance.now()

    if (!process.env.LONGCAT_API_KEY) {
      return errorResult('longcat_structured', 'LONGCAT_API_KEY not set', start)
    }

    try {
      const baseUrl = process.env.LONGCAT_BASE_URL || 'https://api.longcat.ai/v1'
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.LONGCAT_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.V3_LONGCAT_MODEL || 'LongCat-2.0',
          messages: [
            { role: 'system', content: V3_DECISION_SYSTEM_PROMPT },
            { role: 'user', content: buildDecisionPrompt(input) },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'v3_decision',
              schema: V3_DECISION_SCHEMA,
              strict: true,
            },
          },
          temperature: 0.1,
          max_tokens: 300,
        }),
      })

      if (!response.ok) {
        return errorResult('longcat_structured', `HTTP ${response.status}`, start)
      }

      const data = await response.json() as any
      const content = data.choices?.[0]?.message?.content
      if (!content) return errorResult('longcat_structured', 'empty response', start)

      const parsed = JSON.parse(content)
      const latency = performance.now() - start

      return {
        providerId: 'longcat_structured',
        relationship: validateRelationship(parsed.relationship),
        buyerRequestProbability: clamp(parsed.buyerRequestProbability),
        buyerRequest: probabilityToLabel(clamp(parsed.buyerRequestProbability)),
        needOwner: validateNeedOwner(parsed.needOwner),
        timing: validateTiming(parsed.timing),
        fit: validateFit(parsed.fit),
        access: validateAccess(parsed.access),
        messageEligible: clamp(parsed.messageEligible),
        confidence: clamp(parsed.confidence ?? (1 - 2 * Math.abs(clamp(parsed.buyerRequestProbability) - 0.5))),
        latencyMs: Math.round(latency * 100) / 100,
        error: null,
      }
    } catch (e) {
      return errorResult('longcat_structured', String(e), start)
    }
  },
}

// ── Jeff 0.8B Provider ────────────────────────────────────────────────────────

const jeffProvider: Provider = {
  id: 'jeff_0.8b',
  isAvailable: () => !!process.env.JEFF_ENDPOINT,
  decide: async (input: NormalizedInput): Promise<ProviderResult> => {
    const start = performance.now()

    if (!process.env.JEFF_ENDPOINT) {
      return errorResult('jeff_0.8b', 'JEFF_ENDPOINT not set', start)
    }

    try {
      const response = await fetch(`${process.env.JEFF_ENDPOINT}/v1/systemone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: buildDecisionPrompt(input),
          questions: V3_SYSTEMONE_QUESTIONS,
        }),
      })

      if (!response.ok) {
        return errorResult('jeff_0.8b', `HTTP ${response.status}`, start)
      }

      const data = await response.json() as any
      const decisions = data.decisions || []
      const latency = performance.now() - start

      // Parse Jev-format decisions back to V3 format
      return parseSystemOneResult('jeff_0.8b', decisions, latency)
    } catch (e) {
      return errorResult('jeff_0.8b', String(e), start)
    }
  },
}

// ── Kev-4B Provider ──────────────────────────────────────────────────────────

const kevProvider: Provider = {
  id: 'kev_4b',
  isAvailable: () => !!process.env.KEV_ENDPOINT,
  decide: async (input: NormalizedInput): Promise<ProviderResult> => {
    const start = performance.now()

    if (!process.env.KEV_ENDPOINT) {
      return errorResult('kev_4b', 'KEV_ENDPOINT not set', start)
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (process.env.KEV_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.KEV_API_KEY}`
      }

      const response = await fetch(`${process.env.KEV_ENDPOINT}/v1/systemone`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          state: buildDecisionPrompt(input),
          questions: V3_SYSTEMONE_QUESTIONS,
        }),
      })

      if (!response.ok) {
        return errorResult('kev_4b', `HTTP ${response.status}`, start)
      }

      const data = await response.json() as any
      const decisions = data.decisions || []
      const latency = performance.now() - start

      return parseSystemOneResult('kev_4b', decisions, latency)
    } catch (e) {
      return errorResult('kev_4b', String(e), start)
    }
  },
}

// ── Identical Bounded Questions (used by ALL providers) ───────────────────────

const V3_DECISION_SYSTEM_PROMPT = `You are a bounded commercial decision classifier for a software development agency.

You evaluate a single OPPORTUNITY EPISODE, not a person.
A person may have multiple episodes across different organizations.
You only see ONE episode at a time.

Your output is typed classification only. No explanations. No business impact analysis.

Rules:
1. Score the EPISODE, not the person's identity
2. A SERVICE_PROVIDER relationship does NOT disqualify an explicit BUYER_REQUEST episode
3. An agency can hire another agency. A founder can sell services AND hire developers.
4. Explicit apply instructions (email, DM, link) increase buyer_request_probability significantly
5. Timing is separate from intent — high intent + stale timing = aging opportunity, not "no opportunity"
6. Organization scoping: only evaluate the episode for the specified organization
7. If evidence is weak, probabilities should be low
8. Relationship classification describes the PRIMARY role in THIS episode, not the person globally`

const V3_DECISION_SCHEMA = {
  type: 'object',
  properties: {
    relationship: {
      type: 'string',
      enum: ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN'],
    },
    buyerRequestProbability: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Probability (0-1) that this episode represents a buyer request.',
    },
    needOwner: {
      type: 'string',
      enum: ['SELF_NEED', 'ORGANIZATION_NEED', 'HIRING_NEED', 'CUSTOMER_NEED', 'MARKET_PROBLEM', 'SERVICE_OFFERING', 'PRODUCT_PROBLEM', 'UNKNOWN'],
    },
    timing: {
      type: 'string',
      enum: ['CURRENT', 'AGING', 'STALE', 'UNKNOWN'],
    },
    fit: {
      type: 'string',
      enum: ['POOR', 'WEAK', 'MEDIUM', 'STRONG', 'EXCELLENT'],
    },
    access: {
      type: 'string',
      enum: ['NONE', 'INDIRECT', 'CONNECTION', 'DIRECT'],
    },
    messageEligible: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Probability (0-1) that sending a message is appropriate.',
    },
  },
  required: ['relationship', 'buyerRequestProbability', 'needOwner', 'timing', 'fit', 'access', 'messageEligible'],
  additionalProperties: false,
}

// SystemOne-compatible questions for Jeff/Kev (same semantics, different format)
const V3_SYSTEMONE_QUESTIONS = [
  {
    question: 'What is the commercial relationship for this opportunity episode?',
    options: [
      'A. BUYER — the organization/person is looking to buy/acquire software development services',
      'B. SERVICE_PROVIDER — they sell software/technical delivery services to clients',
      'C. COMPETITOR — they are a direct competitor offering similar services',
      'D. PARTNER — potential delivery partner or strategic alliance',
      'E. CANDIDATE — seeking employment or contract work',
      'F. MIXED — multiple roles simultaneously (e.g., service provider with a separate hiring event)',
      'G. UNKNOWN — relationship cannot be determined from evidence',
    ],
  },
  {
    question: 'Is there an explicit or strong buyer request?',
    options: [
      'A. YES — explicit apply instructions, direct ask for outside help, or strong procurement signal',
      'B. PROBABLE — clear need language with some buyer-directional evidence',
      'C. WEAK — implied or indirect signal only',
      'D. NONE — no buyer-directional evidence',
    ],
  },
  {
    question: 'Who owns the need described?',
    options: [
      'A. SELF_NEED — their own organization has the need',
      'B. ORGANIZATION_NEED — a specific organization has the need',
      'C. HIRING_NEED — explicit hiring need (job posting, etc.)',
      'D. CUSTOMER_NEED — their customers/clients have the problem',
      'E. MARKET_PROBLEM — industry/market-level problem',
      'F. SERVICE_OFFERING — they provide this service',
      'G. PRODUCT_PROBLEM — their own product has issues',
      'H. UNKNOWN — need ownership cannot be determined',
    ],
  },
]

function buildDecisionPrompt(input: NormalizedInput): string {
  const parts: string[] = []
  parts.push('Evaluate this single opportunity episode:\n')
  parts.push('## Source Text')
  parts.push(input.rawText)
  if (input.personName) {
    parts.push(`\n## Person: ${input.personName}`)
  }
  if (input.organizationName) {
    parts.push(`## Organization: ${input.organizationName}`)
  }
  parts.push(`\n## Current Date: ${input.currentDate}`)
  parts.push('\nRemember: A SERVICE_PROVIDER relationship does NOT disqualify a separate explicit BUYER_REQUEST event. Score the episode, not the person globally.')
  return parts.join('\n')
}

function parseSystemOneResult(
  providerId: string,
  decisions: Array<{ choice: string; probability: number; confidence?: number }>,
  latencyMs: number,
): ProviderResult {
  if (decisions.length < 6) {
    return {
      providerId, relationship: 'UNKNOWN', buyerRequestProbability: 0.5,
      buyerRequest: 'WEAK', needOwner: 'UNKNOWN', timing: 'UNKNOWN',
      fit: 'MEDIUM', access: 'INDIRECT', messageEligible: 0.5,
      confidence: 0.3, latencyMs: Math.round(latencyMs * 100) / 100,
      error: `Insufficient decisions: ${decisions.length}`,
    }
  }

  const relChoice = decisions[0]?.choice || 'G'
  const buyerChoice = decisions[1]?.choice || 'D'
  const ownerChoice = decisions[2]?.choice || 'H'

  const relMap: Record<string, string> = { A: 'BUYER', B: 'SERVICE_PROVIDER', C: 'COMPETITOR', D: 'PARTNER', E: 'CANDIDATE', F: 'MIXED', G: 'UNKNOWN' }
  const buyerMap: Record<string, number> = { A: 0.85, B: 0.6, C: 0.25, D: 0.05 }
  const ownerMap: Record<string, string> = { A: 'SELF_NEED', B: 'ORGANIZATION_NEED', C: 'HIRING_NEED', D: 'CUSTOMER_NEED', E: 'MARKET_PROBLEM', F: 'SERVICE_OFFERING', G: 'PRODUCT_PROBLEM', H: 'UNKNOWN' }

  const buyerProb = buyerMap[buyerChoice] ?? 0.5

  return {
    providerId,
    relationship: relMap[relChoice] || 'UNKNOWN',
    buyerRequestProbability: buyerProb,
    buyerRequest: probabilityToLabel(buyerProb),
    needOwner: ownerMap[ownerChoice] || 'UNKNOWN',
    timing: 'CURRENT',  // SystemOne doesn't have timing question in this set
    fit: 'MEDIUM',
    access: 'CONNECTION',
    messageEligible: buyerProb >= 0.4 ? buyerProb : buyerProb * 0.3,
    confidence: decisions[0]?.confidence ?? 0.5,
    latencyMs: Math.round(latencyMs * 100) / 100,
    error: null,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function probabilityToLabel(prob: number): string {
  if (prob >= 0.6) return 'EXPLICIT'
  if (prob >= 0.35) return 'STRONG'
  if (prob >= 0.15) return 'WEAK'
  return 'NONE'
}

function clamp(v: unknown): number {
  if (typeof v !== 'number' || isNaN(v)) return 0.5
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100))
}

function validateRelationship(v: unknown): string {
  const valid = ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN']
  return valid.includes(v as string) ? v as string : 'UNKNOWN'
}

function validateNeedOwner(v: unknown): string {
  const valid = ['SELF_NEED', 'ORGANIZATION_NEED', 'HIRING_NEED', 'CUSTOMER_NEED', 'MARKET_PROBLEM', 'SERVICE_OFFERING', 'PRODUCT_PROBLEM', 'UNKNOWN']
  return valid.includes(v as string) ? v as string : 'UNKNOWN'
}

function validateTiming(v: unknown): string {
  return ['CURRENT', 'AGING', 'STALE', 'UNKNOWN'].includes(v as string) ? v as string : 'UNKNOWN'
}

function validateFit(v: unknown): string {
  return ['POOR', 'WEAK', 'MEDIUM', 'STRONG', 'EXCELLENT'].includes(v as string) ? v as string : 'MEDIUM'
}

function validateAccess(v: unknown): string {
  return ['NONE', 'INDIRECT', 'CONNECTION', 'DIRECT'].includes(v as string) ? v as string : 'INDIRECT'
}

function errorResult(providerId: string, error: string, start: number): ProviderResult {
  return {
    providerId, relationship: 'UNKNOWN', buyerRequestProbability: 0,
    buyerRequest: 'NONE', needOwner: 'UNKNOWN', timing: 'UNKNOWN',
    fit: 'POOR', access: 'NONE', messageEligible: 0, confidence: 0,
    latencyMs: Math.round((performance.now() - start) * 100) / 100,
    error,
  }
}

// ── Run Benchmark ────────────────────────────────────────────────────────────

const ALL_PROVIDERS: Provider[] = [
  deterministicProvider,
  openaiProvider,
  longcatProvider,
  jeffProvider,
  kevProvider,
]

export async function runBenchmark() {
  const available = ALL_PROVIDERS.filter(p => p.isAvailable())
  console.log(`Available providers: ${available.map(p => p.id).join(', ')}`)
  console.log(`Frozen examples: ${FROZEN_EVAL_SET.length}`)

  const results: Array<Record<string, unknown>> = []

  for (const example of FROZEN_EVAL_SET) {
    const input = normalizeForProvider(example)

    for (const provider of available) {
      const result = await provider.decide(input)
      results.push({
        exampleId: example.id,
        category: example.category,
        provider: result.providerId,
        // Ground truth
        gt_relationship: example.labels.relationship,
        gt_buyerRequest: example.labels.buyerRequest,
        gt_needOwner: example.labels.needOwnership,
        gt_messageEligible: example.labels.messageEligible,
        gt_action: example.labels.action,
        // Predictions
        pred_relationship: result.relationship,
        pred_buyerRequestProbability: result.buyerRequestProbability,
        pred_buyerRequest: result.buyerRequest,
        pred_needOwner: result.needOwner,
        pred_timing: result.timing,
        pred_fit: result.fit,
        pred_access: result.access,
        pred_messageEligible: result.messageEligible,
        pred_confidence: result.confidence,
        // Metrics
        latencyMs: result.latencyMs,
        error: result.error,
      })
    }
  }

  return results
}
