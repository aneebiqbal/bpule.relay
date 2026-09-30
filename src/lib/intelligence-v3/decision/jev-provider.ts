/**
 * Jev Decision Provider — V3
 *
 * TypeSafe Jev integration behind feature flag.
 * Runs in SHADOW mode initially — not production-authoritative.
 *
 * Requires: JEV_API_KEY environment variable
 */

import type { V3DecisionProvider, V3ProviderContext, V3ProviderResult } from './decision-provider'
import type { V3DecisionAnswers } from './bounded-questions'
import { V3_DECISION_SYSTEM_PROMPT, buildDecisionUserPrompt } from './bounded-questions'

export class JevDecisionProvider implements V3DecisionProvider {
  readonly id = 'jev'
  readonly modelVersion: string

  private apiKey: string
  private baseUrl: string
  private model: string

  constructor(options: {
    apiKey?: string
    model?: string
    baseUrl?: string
  } = {}) {
    this.apiKey = options.apiKey || process.env.JEV_API_KEY || ''
    this.model = options.model || process.env.JEV_MODEL || 'jev-latest'
    this.baseUrl = options.baseUrl || process.env.JEV_BASE_URL || 'https://api.jev.ai/v1'
    this.modelVersion = `jev_${this.model}_v3`
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0
  }

  async decide(context: V3ProviderContext): Promise<V3ProviderResult> {
    const startTime = Date.now()
    const userPrompt = buildDecisionUserPrompt({
      person: {
        fullName: context.person.fullName,
        affiliations: context.person.affiliations.map((a) => ({
          organizationName: a.organizationName,
          role: a.role,
          isCurrent: a.isCurrent,
        })),
        location: context.person.location,
      },
      organization: context.organization ? {
        name: context.organization.name,
        industry: context.organization.industry,
        size: context.organization.size,
      } : { name: null, industry: null, size: null },
      episode: {
        eventType: context.anchorEvent.eventType,
        explicitRequest: context.episode.explicitRequest,
        requestedCapabilities: context.episode.requestedCapabilities,
        applicationChannels: context.episode.applicationChannels,
        status: context.episode.status,
        ageDays: context.episode.ageDays,
        evidenceCount: context.episode.evidenceRefs.length,
        needOwner: context.episode.needOwnerType,
      },
      evidenceSummary: context.evidence,
      currentDate: context.currentDate,
      senderCapabilities: context.senderCapabilities,
    })

    const response = await fetch(`${this.baseUrl}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Jev-Mode': 'structured',
      },
      body: JSON.stringify({
        model: this.model,
        system_prompt: V3_DECISION_SYSTEM_PROMPT,
        user_prompt: userPrompt,
        temperature: 0.1,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Jev decision call failed: ${response.status} ${body}`)
    }

    const result = await response.json() as Record<string, unknown>
    const answers = this.normalizeJevResponse(result)

    return {
      answers,
      providerId: this.id,
      modelVersion: this.modelVersion,
      latencyMs: Date.now() - startTime,
      confidence: this.computeJevConfidence(answers),
      raw: result,
    }
  }

  private normalizeJevResponse(raw: Record<string, unknown>): V3DecisionAnswers {
    // Jev may return different key formats; normalize
    const get = (key: string, fallback: unknown) => raw[key] ?? raw[key.toLowerCase()] ?? fallback

    return {
      relationship: this.validateRel(get('relationship', 'UNKNOWN')),
      buyerRequestProbability: this.clamp(get('buyer_request_probability', get('buyerRequestProbability', 0.5))),
      externalNeedProbability: this.clamp(get('external_need_probability', get('externalNeedProbability', 0.5))),
      needOwner: this.validateOwner(get('need_owner', get('needOwner', 'UNKNOWN'))),
      fit: this.validateFit(get('fit', 'MEDIUM')),
      timing: this.validateTiming(get('timing', 'WEAK')),
      access: this.validateAccess(get('access', 'INDIRECT')),
      messageEligible: this.clamp(get('message_eligible', get('messageEligible', 0.5))),
    }
  }

  private validateRel(v: unknown): V3DecisionAnswers['relationship'] {
    const valid = ['BUYER', 'SERVICE_PROVIDER', 'COMPETITOR', 'PARTNER', 'CANDIDATE', 'MIXED', 'UNKNOWN']
    return typeof v === 'string' && valid.includes(v) ? v as V3DecisionAnswers['relationship'] : 'UNKNOWN'
  }

  private validateOwner(v: unknown): V3DecisionAnswers['needOwner'] {
    const valid = ['SELF_NEED', 'ORGANIZATION_NEED', 'HIRING_NEED', 'CUSTOMER_NEED', 'MARKET_PROBLEM', 'SERVICE_OFFERING', 'PRODUCT_PROBLEM', 'UNKNOWN']
    return typeof v === 'string' && valid.includes(v) ? v as V3DecisionAnswers['needOwner'] : 'UNKNOWN'
  }

  private validateFit(v: unknown): V3DecisionAnswers['fit'] {
    const valid = ['POOR', 'WEAK', 'MEDIUM', 'STRONG', 'EXCELLENT']
    return typeof v === 'string' && valid.includes(v) ? v as V3DecisionAnswers['fit'] : 'MEDIUM'
  }

  private validateTiming(v: unknown): V3DecisionAnswers['timing'] {
    const valid = ['STALE', 'WEAK', 'CURRENT', 'URGENT']
    return typeof v === 'string' && valid.includes(v) ? v as V3DecisionAnswers['timing'] : 'WEAK'
  }

  private validateAccess(v: unknown): V3DecisionAnswers['access'] {
    const valid = ['NONE', 'INDIRECT', 'CONNECTION', 'DIRECT']
    return typeof v === 'string' && valid.includes(v) ? v as V3DecisionAnswers['access'] : 'INDIRECT'
  }

  private clamp(v: unknown): number {
    if (typeof v !== 'number' || isNaN(v)) return 0.5
    return Math.max(0, Math.min(1, v))
  }

  private computeJevConfidence(answers: V3DecisionAnswers): number {
    const buyerConf = 1 - 2 * Math.abs(answers.buyerRequestProbability - 0.5)
    const externalConf = 1 - 2 * Math.abs(answers.externalNeedProbability - 0.5)
    return Math.round(((buyerConf + externalConf) / 2) * 100) / 100
  }
}
