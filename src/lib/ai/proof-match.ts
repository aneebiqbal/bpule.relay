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