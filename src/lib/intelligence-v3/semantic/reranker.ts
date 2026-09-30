/**
 * Semantic Reranking — V3
 *
 * Replaces keyword-overlap proof matching with semantic relevance scoring.
 *
 * Pipeline: retrieve candidates → rerank → keep top supported proof.
 * If no proof clears threshold: "No verified proof".
 *
 * Supports pluggable embedding providers. Falls back to deterministic
 * keyword scoring when no embedding provider is available.
 */

import type { V3OpportunityEpisode } from '../types'

export interface V3ProofCandidate {
  id: string
  summary: string
  clientName?: string
  reviewQuote?: string
  technologies: string[]
}

export interface V3RerankResult {
  proofId: string
  score: number
  summary: string
  /** Whether this proof clears the relevance threshold */
  relevant: boolean
}

export interface V3Reranker {
  readonly id: string
  rerank(episode: V3OpportunityEpisode, candidates: V3ProofCandidate[]): Promise<V3RerankResult[]> | V3RerankResult[]
}

// ── Thresholds ──────────────────────────────────────────────────────────────

const PROOF_RELEVANCE_THRESHOLD = 0.4
const TOP_K = 3

// ── Keyword-Based Fallback Reranker ──────────────────────────────────────────

export class KeywordReranker implements V3Reranker {
  readonly id = 'keyword_fallback'

  rerank(
    episode: V3OpportunityEpisode,
    candidates: V3ProofCandidate[],
  ): V3RerankResult[] {
    const requested = episode.requestedCapabilities.map((c) => c.toLowerCase())

    return candidates
      .map((candidate) => {
        const score = computeKeywordRelevance(requested, candidate)
        return {
          proofId: candidate.id,
          score,
          summary: candidate.summary,
          relevant: score >= PROOF_RELEVANCE_THRESHOLD,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K)
  }
}

function computeKeywordRelevance(
  requestedCapabilities: string[],
  candidate: V3ProofCandidate,
): number {
  if (requestedCapabilities.length === 0) return 0.3

  const candidateText = [
    candidate.summary,
    ...candidate.technologies,
    candidate.reviewQuote ?? '',
  ]
    .join(' ')
    .toLowerCase()

  let matches = 0
  for (const req of requestedCapabilities) {
    if (candidateText.includes(req) || req.includes(candidateText)) {
      matches++
    }
  }

  // Also check partial matches
  for (const req of requestedCapabilities) {
    const reqWords = req.split(/\s+/)
    for (const word of reqWords) {
      if (word.length > 3 && candidateText.includes(word)) {
        matches += 0.3
      }
    }
  }

  return Math.min(1, matches / requestedCapabilities.length)
}

// ── Semantic Embedding Reranker (placeholder for model integration) ─────────

export class SemanticReranker implements V3Reranker {
  readonly id = 'semantic_embedding'
  private endpoint: string

  constructor(endpoint?: string) {
    this.endpoint = endpoint || process.env.V3_RERANKER_ENDPOINT || ''
  }

  async rerank(
    episode: V3OpportunityEpisode,
    candidates: V3ProofCandidate[],
  ): Promise<V3RerankResult[]> {
    if (!this.endpoint) {
      // Fall back to keyword reranking
      const fallback = new KeywordReranker()
      return fallback.rerank(episode, candidates)
    }

    // Build query from episode context
    const query = buildEpisodeQuery(episode)

    try {
      const response = await fetch(`${this.endpoint}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          documents: candidates.map((c) => `${c.summary} ${c.technologies.join(' ')}`),
        }),
      })

      if (!response.ok) {
        const fallback = new KeywordReranker()
        return fallback.rerank(episode, candidates)
      }

      const result = await response.json() as { scores: number[] }
      return candidates
        .map((candidate, i) => ({
          proofId: candidate.id,
          score: result.scores?.[i] ?? 0,
          summary: candidate.summary,
          relevant: (result.scores?.[i] ?? 0) >= PROOF_RELEVANCE_THRESHOLD,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K)
    } catch {
      const fallback = new KeywordReranker()
      return fallback.rerank(episode, candidates)
    }
  }
}

function buildEpisodeQuery(episode: V3OpportunityEpisode): string {
  const parts: string[] = []
  if (episode.organizationName) parts.push(episode.organizationName)
  parts.push(episode.anchorEvent.eventType)
  parts.push(...episode.requestedCapabilities)
  return parts.join(' ')
}

// ── Registry ─────────────────────────────────────────────────────────────────

let _reranker: V3Reranker | null = null

export function getReranker(): V3Reranker {
  if (!_reranker) {
    _reranker = process.env.V3_RERANKER_ENDPOINT
      ? new SemanticReranker()
      : new KeywordReranker()
  }
  return _reranker!
}

export function setReranker(reranker: V3Reranker): void {
  _reranker = reranker
}

export const PROOF_MATCH_THRESHOLD = PROOF_RELEVANCE_THRESHOLD
