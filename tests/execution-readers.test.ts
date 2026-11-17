import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

/**
 * Every execution-facing surface must derive "what can this rep work" from the
 * canonical scope, not from a bare eligibility row. Eligibility without a seat
 * is what made an admin-assigned operator invisible.
 */
describe('EXECUTION_READERS_USE_CANONICAL_SCOPE', () => {
  it('the rep dashboard derives its My Day identities from the canonical scope', () => {
    const source = read('src/lib/relay/dashboard-loader.ts')
    expect(source).toContain('listExecutableIdentitiesForRep')
    expect(source).toContain('listExecutableIdentitiesForOrg')
    // The rep scope must not be a raw eligibility read.
    const repBlock = source.slice(source.indexOf('Execution scope and availability'))
    expect(repBlock).not.toContain("from('identity_assignments')")
  })

  it('the team day overview uses the org-wide canonical scope', () => {
    const source = read('src/lib/rep-day/team.ts')
    expect(source).toContain('listExecutableIdentitiesForOrg')
    expect(source).not.toContain("from('identity_assignments')")
  })

  it('the org-wide canonical scope exists alongside the per-rep one', () => {
    const source = read('src/lib/coverage/access.ts')
    expect(source).toContain('export async function listExecutableIdentitiesForOrg')
  })

  it('the dead eligibility-only getRepAssignments reader is gone', () => {
    expect(read('src/lib/store/supabase-store.ts')).not.toContain('getRepAssignments')
    expect(read('src/lib/store/types.ts')).not.toContain('getRepAssignments')
    expect(read('src/lib/store/mock-store.ts')).not.toContain('getRepAssignments')
  })
})
