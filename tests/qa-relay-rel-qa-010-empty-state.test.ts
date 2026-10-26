/**
 * REL-QA-010 — contradictory empty-state copy (production QA, 26 Oct 2026).
 *
 * Reported: a board with leads still said "No leads yet" when a filter or search
 * returned nothing, and analytics said "Add your first lead" in a state that was
 * not "no leads".
 *
 * Fix: one selector that names the actual state — no leads, no match for the
 * search, or no match for the selected view.
 */
import { describe, expect, it } from 'vitest'
import { resolveLeadsBoardEmptyState } from '@/components/leads/pipeline-utils'

describe('REL-QA-010 — leads board empty state', () => {
  it('no leads at all says "No leads yet"', () => {
    const state = resolveLeadsBoardEmptyState({ leadsCount: 0, filteredCount: 0, search: '' })
    expect(state?.kind).toBe('none')
    expect(state?.title).toBe('No leads yet.')
  })

  it('leads exist but the filter matches none: never "No leads yet"', () => {
    const state = resolveLeadsBoardEmptyState({ leadsCount: 6, filteredCount: 0, search: '' })
    expect(state?.kind).toBe('filter')
    expect(state?.title).not.toMatch(/no leads yet/i)
    expect(state?.title).toMatch(/this view/i)
  })

  it('a search with no match is about the search, not about having no leads', () => {
    const state = resolveLeadsBoardEmptyState({ leadsCount: 6, filteredCount: 0, search: 'zzz' })
    expect(state?.kind).toBe('search')
    expect(state?.title).toMatch(/search/i)
  })

  it('content present returns null (no empty state)', () => {
    expect(resolveLeadsBoardEmptyState({ leadsCount: 6, filteredCount: 2, search: '' })).toBeNull()
  })
})
