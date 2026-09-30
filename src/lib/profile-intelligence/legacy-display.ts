/**
 * Display fallbacks for profiles created before Profile Intelligence V2.
 *
 * Migration 0090 added full_name / current_role / source_count / proof_count /
 * readiness with empty defaults, but existing profiles keep their real data in
 * the original columns (label, headline, cv_path) and proof tables. These
 * helpers read that data for display only — nothing is written back, so the
 * enrichment flow still sees the V2 fields as empty and can fill them with
 * provenance.
 */

type Row = Record<string, any>

const PLATFORM_LABEL: Record<string, string> = { linkedin: 'LinkedIn', upwork: 'Upwork' }

export function profileDisplayName(row: Row): string | null {
  const name = row.full_name || row.display_name || row.label
  if (name) return name
  const rep = Array.isArray(row.rep) ? row.rep[0] : row.rep
  if (rep?.name) return row.platform ? `${rep.name} (${PLATFORM_LABEL[row.platform] ?? row.platform})` : rep.name
  return null
}

export function profileDisplayRole(row: Row): string | null {
  return row.current_role || row.headline || null
}

/** Reads PostgREST embedded `table(count)` results: [{ count: n }] → n. */
export function embeddedCount(v: unknown): number {
  return Array.isArray(v) && v.length > 0 && typeof v[0]?.count === 'number' ? v[0].count : 0
}

export function liveCounts(row: Row): { proofCount: number; sourceCount: number } {
  const proofCount = embeddedCount(row.proof_cards_count) + embeddedCount(row.proof_items_count)
  const sourceCount = embeddedCount(row.sources_count) + (row.cv_path ? 1 : 0)
  return {
    proofCount: Math.max(proofCount, row.proof_count ?? 0),
    sourceCount: Math.max(sourceCount, row.source_count ?? 0),
  }
}

/**
 * The stored readiness defaults to needs_source for every pre-V2 profile. A
 * legacy profile that already has a CV or proof needs review, not a source.
 */
export function effectiveReadiness(row: Row, counts: { proofCount: number; sourceCount: number }): string {
  const stored = row.readiness ?? 'needs_source'
  if (stored !== 'needs_source') return stored
  return counts.sourceCount > 0 || counts.proofCount > 0 ? 'needs_review' : 'needs_source'
}

/** Select fragment for the embedded live counts used above. */
export const LIVE_COUNT_SELECT = `
  proof_cards_count:proof_cards(count),
  proof_items_count:proof_items(count),
  sources_count:profile_sources(count)`
