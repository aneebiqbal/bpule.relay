import { describe, expect, it } from 'vitest'
import { effectiveReadiness, liveCounts, profileDisplayName, profileDisplayRole } from '@/lib/profile-intelligence/legacy-display'

describe('pre-V2 profile display fallbacks', () => {
  const legacy = {
    full_name: null, display_name: null, label: 'Hassan — Upwork', headline: 'Senior Backend Engineer',
    current_role: null, platform: 'upwork', cv_path: 'cvs/hassan.pdf', readiness: 'needs_source', source_count: 0, proof_count: 0,
    rep: { name: 'Hassan' },
    proof_cards_count: [{ count: 2 }], proof_items_count: [{ count: 3 }], sources_count: [{ count: 0 }],
  }

  it('uses label / headline when V2 fields are empty', () => {
    expect(profileDisplayName(legacy)).toBe('Hassan — Upwork')
    expect(profileDisplayRole(legacy)).toBe('Senior Backend Engineer')
  })

  it('falls back to rep name + platform when there is no label', () => {
    expect(profileDisplayName({ ...legacy, label: null })).toBe('Hassan (Upwork)')
  })

  it('prefers V2 fields when present', () => {
    expect(profileDisplayName({ ...legacy, full_name: 'Hassan Raza' })).toBe('Hassan Raza')
    expect(profileDisplayRole({ ...legacy, current_role: 'Staff Engineer' })).toBe('Staff Engineer')
  })

  it('counts legacy proof items, proof cards and the legacy CV', () => {
    expect(liveCounts(legacy)).toEqual({ proofCount: 5, sourceCount: 1 })
  })

  it('a legacy profile with a CV or proof needs review, not a source', () => {
    expect(effectiveReadiness(legacy, liveCounts(legacy))).toBe('needs_review')
    const empty = { ...legacy, cv_path: null, proof_cards_count: [{ count: 0 }], proof_items_count: [{ count: 0 }] }
    expect(effectiveReadiness(empty, liveCounts(empty))).toBe('needs_source')
    expect(effectiveReadiness({ ...legacy, readiness: 'ready' }, liveCounts(legacy))).toBe('ready')
  })
})
