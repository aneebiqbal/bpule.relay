import type { IdeaGenomeSource } from '@/lib/domain/types'

/**
 * Research Layer.
 *
 * Provides external evidence when content requires it.
 *
 * Design:
 * - Research is OPTIONAL and only triggered when needed
 * - Personal stories do NOT require research
 * - Factual claims, statistics, and current events DO require research
 * - If research is unavailable, the system constrains content rather than hallucinating
 */

export interface ResearchSource {
  url: string
  title: string
  publishedAt: string | null
  extractedFacts: string[]
  freshness: 'fresh' | 'stale' | 'unknown'
}

export interface ResearchResult {
  shouldResearch: boolean
  reason: string
  sources: ResearchSource[]
  constraints: string[]  // constraints on what can be claimed without evidence
}

/**
 * Determine whether an idea requires external research.
 *
 * Personal experience and opinions generally don't.
 * Factual claims about technologies, releases, and statistics do.
 */
export function requiresResearch(input: {
  sourceMaterial: string
  genomeSource: IdeaGenomeSource | null
  supportingFacts: string[]
}): { shouldResearch: boolean; reason: string } {
  // Personal experience never needs external research
  if (input.genomeSource === 'personal_experience') {
    return { shouldResearch: false, reason: 'Personal experience post — no external verification needed.' }
  }

  const lower = input.sourceMaterial.toLowerCase()

  // Check for research triggers
  const researchTriggers = [
    { pattern: /\b(released|announced|launched|published)\s+(yesterday|last\s+week|this\s+week|recently)\b/i, reason: 'Recent release/event mentioned' },
    { pattern: /\b(\d+%|\d+x\s+faster|\d+\s+percent|\$\d+|\d+\s+users|\d+\s+developers)\b/, reason: 'Specific statistics or metrics cited' },
    { pattern: /\b(compared\s+to|vs\.?\s+|versus|benchmark|performance\s+test)\b/i, reason: 'Technology comparison made' },
    { pattern: /\b(industry|market|survey|report|study\s+found)\b/i, reason: 'Industry claim referenced' },
    { pattern: /\b(new\s+version|v\d+\.\d+|update\s+dropped|just\s+shipped)\b/i, reason: 'Software version/release referenced' },
    { pattern: /\b(Rails|React|Next\.js|Django|Spring|Angular|Vue|Svelte|Node|Express|FastAPI|Flask)\s+\d+\.\d+/i, reason: 'Framework version-specific claim' },
    { pattern: /\b(changed|adds?|removes?|introduces?|deprecates?)\s+(how|the|support|feature|behavior|API)\b/i, reason: 'Framework behavior change claimed' },
  ]

  for (const trigger of researchTriggers) {
    if (trigger.pattern.test(lower)) {
      return { shouldResearch: true, reason: trigger.reason }
    }
  }

  // If there are supporting facts that look like external claims
  if (input.supportingFacts.length > 0) {
    for (const fact of input.supportingFacts) {
      if (/\d+%|\d+x|\b(released|announced|survey|study)\b/i.test(fact)) {
        return { shouldResearch: true, reason: 'Supporting facts contain verifiable claims.' }
      }
    }
  }

  return { shouldResearch: false, reason: 'No external verification required for this content.' }
}

/**
 * Build a research-aware prompt block for generation.
 *
 * If research was performed, includes the sources.
 * If research was needed but unavailable, includes constraints.
 */
export function buildResearchPromptBlock(result: ResearchResult): string {
  if (!result.shouldResearch) return ''

  if (result.sources.length > 0) {
    const sourceLines = result.sources.map((s) => {
      const facts = s.extractedFacts.length > 0 ? ` — ${s.extractedFacts.join('; ')}` : ''
      return `- ${s.title} (${s.freshness})${facts}`
    })
    return `VERIFIED SOURCES (cite these, do not contradict):\n${sourceLines.join('\n')}`
  }

  if (result.constraints.length > 0) {
    return `RESEARCH CONSTRAINTS (no external verification available — constrain claims):\n${result.constraints.map((c) => `- ${c}`).join('\n')}`
  }

  return ''
}

/**
 * Generate research constraints when research is needed but unavailable.
 */
export function generateConstraints(sourceMaterial: string): string[] {
  const constraints: string[] = [
    'Do not cite specific statistics, percentages, or metrics unless they come from the user\'s own experience.',
    'Do not claim a recent release or event happened unless the user explicitly mentioned it.',
    'Keep opinions framed as personal perspective, not industry fact.',
  ]

  const lower = sourceMaterial.toLowerCase()
  if (/\b\d+%|\d+x\s+faster/i.test(lower)) {
    constraints.push('Remove or attribute any specific performance claims.')
  }
  if (/\b(released|announced|launched)\b/i.test(lower)) {
    constraints.push('Verify any release claims are from the user\'s direct knowledge.')
  }

  return constraints
}

/**
 * Research provider interface.
 *
 * Implementations can wrap different search APIs.
 * If no provider is configured, the system falls back to constraints.
 */
export interface ResearchProvider {
  isAvailable(): boolean
  search(query: string, limit?: number): Promise<ResearchSource[]>
}

/**
 * No-op research provider (default when no search API is configured).
 */
export const noopResearchProvider: ResearchProvider = {
  isAvailable: () => false,
  search: async () => [],
}

/**
 * Attempt to perform research if a provider is available.
 */
export async function performResearch(
  provider: ResearchProvider,
  query: string,
  publishedAfter?: string | null,
): Promise<ResearchSource[]> {
  if (!provider.isAvailable()) return []

  try {
    const results = await provider.search(query, 3)
    // Filter by freshness if a date is specified
    if (publishedAfter) {
      const cutoff = new Date(publishedAfter).getTime()
      return results.filter((r) => {
        if (!r.publishedAt) return true
        return new Date(r.publishedAt).getTime() >= cutoff
      })
    }
    return results
  } catch {
    return []
  }
}

/**
 * Source provenance labels for claim safety.
 */
export type ClaimProvenance = 'USER_FACT' | 'EXTERNAL_FACT' | 'MODEL_INFERENCE' | 'MODEL_SUGGESTION'

/**
 * Classify a claim's provenance based on its source.
 */
export function classifyClaimProvenance(claim: string, hasSource: boolean, isFromUser: boolean): ClaimProvenance {
  if (isFromUser) return 'USER_FACT'
  if (hasSource) return 'EXTERNAL_FACT'
  if (/\b(i think|i believe|in my opinion|it seems|probably|might|could)\b/i.test(claim)) return 'MODEL_SUGGESTION'
  return 'MODEL_INFERENCE'
}
