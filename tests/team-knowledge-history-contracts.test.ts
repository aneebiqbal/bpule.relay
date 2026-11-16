/**
 * Team knowledge + history contracts.
 *
 * Knowledge edits must write the EXISTING knowledge tables (no parallel model)
 * and record an audit row. The history timeline must read existing audit
 * authorities and never invent values.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('KNOWLEDGE WRITES EXISTING TABLES', () => {
  const source = read('src/app/api/team/profiles/[profileId]/knowledge/route.ts')

  it('edits profile fields through the human-verified path', () => {
    expect(source).toContain('recordHumanEdits')
    const workspace = read('src/components/team/knowledge-workspace.tsx')
    expect(workspace).toContain('/api/profile-intelligence/profiles/')
    expect(workspace).toContain('/api/profiles/')
  })

  it('writes the canonical knowledge tables, not a second model', () => {
    for (const table of ['profile_experience', 'portfolio_projects', 'profile_claims', 'proof_cards']) {
      expect(source).toContain(`'${table}'`)
    }
    expect(source).not.toContain('profile_knowledge_audit')
  })

  it('audits every change with before and after values', () => {
    expect(source).toContain('accountability_audit_log')
    expect(source).toContain('previous_value')
    expect(source).toContain('new_value')
    expect(source).toContain('actor_id')
  })

  it('is org-scoped and capability-gated', () => {
    expect(source).toContain("can(ctx, 'MANAGE_REVENUE_IDENTITIES')")
    expect(source).toContain('.eq(\'organization_id\', ctx.orgId)')
  })
})

describe('HISTORY READS EXISTING AUDIT AUTHORITIES', () => {
  const source = read('src/app/api/team/profiles/[profileId]/history/route.ts')

  it('reads the audit, coverage and acknowledgement authorities', () => {
    expect(source).toContain('accountability_audit_log')
    expect(source).toContain('coverage_events')
    expect(source).toContain('responsibility_acknowledgements')
  })

  it('carries before/after and actor through to the timeline', () => {
    expect(source).toContain('before:')
    expect(source).toContain('after:')
    expect(source).toContain('actor:')
  })
})

describe('PEOPLE AND PERFORMANCE WORKSPACES', () => {
  it('people cards read the canonical directory and offer direct actions', () => {
    const source = read('src/components/team/people-workspace.tsx')
    expect(source).toContain('PeopleWorkspace')
    expect(source).toContain('Manage assignments')
    expect(source).toContain('AssignTaskButton')
    expect(source).toContain('Performance')
  })

  it('performance exposes views with target versus actual', () => {
    const source = read('src/app/(app)/team/performance/page.tsx')
    expect(source).toContain("view === 'overview'")
    expect(source).toContain("view === 'people'")
    expect(source).toContain("view === 'profiles'")
    expect(source).toContain("view === 'channels'")
    expect(source).toContain("view === 'conversions'")
    expect(source).toContain('TeamTargetsReport')
  })
})
