/**
 * Closure contracts for the remaining high-impact P2 findings closed in this pass.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('ZERO_TARGET_IS_A_REAL_VALUE', () => {
  it('the writer deactivates a lane instead of rejecting zero', () => {
    const source = read('src/lib/operations/work-setup-write.ts')
    expect(source).toContain('must be zero or a positive number.')
    expect(source).toContain('if (targetCount === 0)')
    expect(source).toMatch(/active: false/)
  })

  it('Work Setup sends zero lanes instead of dropping them', () => {
    const source = read('src/components/operations/work-setup.tsx')
    expect(source).not.toContain('targets: draft.targets.filter((row) => row.targetCount > 0)')
  })
})

describe('DEAD_AFFORDANCES_REMOVED', () => {
  it('/admin/people has no owner-only no-op Edit control', () => {
    const source = read('src/components/admin/people-view.tsx')
    expect(source).not.toMatch(/>\s*Edit\s*</)
  })

  it('/team/[repId] heatmap does not claim a drilldown it does not have', () => {
    const source = read('src/app/(app)/team/[repId]/page.tsx')
    expect(source).not.toContain('dayHref=')
  })
})

describe('PROFILES_TABLE_HONOURS_WORKSPACE_FILTERS', () => {
  it('the table receives the already-filtered set', () => {
    const source = read('src/components/team/person-profiles-workspace.tsx')
    expect(source).toContain('<TeamProfilesTable profiles={filtered}')
    expect(source).not.toContain('<TeamProfilesTable profiles={profiles}')
  })
})

describe('THREAD_REVIEW_TOTALS_MATCH', () => {
  it('review total is the review-match count, not every open conversation', () => {
    const source = read('src/lib/operations/chat-queue.ts')
    expect(source).toContain("const total = query.view === 'review' ? counts.review : filtered.length")
  })
})
