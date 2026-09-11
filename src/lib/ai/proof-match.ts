import type { ProofItem } from '@/lib/domain/types'

/**
 * Proof matching by tag overlap, not by a model call.
 *
 * Tagging happens once when a proof item is added (one cheap classification
 * call, cached forever on the row). At draft time we score proof items by
 * how many of their tags appear in the lead's tags and return the strongest
 * one or two. No token is spent per lead here.
 */
export function matchProofItemsByTags(
  proofItems: ProofItem[],
  leadTags: string[],
  limit = 2,
): ProofItem[] {
  const lead = new Set(leadTags.map((t) => t.toLowerCase()))
  const scored = proofItems
    .map((item) => ({
      item,
      overlap: item.tags.filter((t) => lead.has(t.toLowerCase())).length,
    }))
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
  return scored.slice(0, limit).map((s) => s.item)
}

export function overlapTags(
  proofItem: ProofItem,
  leadTags: string[],
): string[] {
  const lead = new Set(leadTags.map((t) => t.toLowerCase()))
  return proofItem.tags.filter((t) => lead.has(t.toLowerCase()))
}

export interface SemanticMatchResult {
  item: ProofItem
  similarity: number
}

/**
 * Merge tag-based and semantic-embedding results.
 *
 * Semantic matches are returned first when their similarity is above the
 * threshold; tag overlap fills the rest of the limit. This gives the
 * best of both worlds: exact tag hits are still strong signals, but
 * near-misses like "Rails API" vs "ruby-on-rails" are rescued by embeddings.
 */
export function mergeProofMatches(
  semantic: SemanticMatchResult[],
  tagBased: ProofItem[],
  limit = 2,
  semanticThreshold = 0.72,
): ProofItem[] {
  const seen = new Set<string>()
  const out: ProofItem[] = []

  for (const s of semantic) {
    if (s.similarity >= semanticThreshold && !seen.has(s.item.id)) {
      out.push(s.item)
      seen.add(s.item.id)
    }
  }

  for (const t of tagBased) {
    if (out.length >= limit) break
    if (!seen.has(t.id)) {
      out.push(t)
      seen.add(t.id)
    }
  }

  return out.slice(0, limit)
}
