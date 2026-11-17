import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { diffPeopleChain } from '@/components/coverage/people-chain-diff'

const snapshot = {
  primaryRepId: 'p1',
  operators: [
    { repId: 'o1', repName: 'A' },
    { repId: 'o2', repName: 'B' },
  ],
  backups: [
    { repId: 'b1', repName: 'C' },
    { repId: 'b2', repName: 'D' },
  ],
}

describe('PEOPLE_CHAIN_DIFF', () => {
  it('reports no change when the draft equals the current chain', () => {
    const diff = diffPeopleChain(snapshot, { primary: 'p1', operatorIds: ['o1', 'o2'], backupIds: ['b1', 'b2'] })
    expect(diff.changed).toBe(false)
    expect(diff.primary.changed).toBe(false)
    expect(diff.operators).toEqual({ added: [], removed: [] })
  })

  it('detects a primary change without dropping the rest of the chain', () => {
    const diff = diffPeopleChain(snapshot, { primary: 'o1', operatorIds: ['o2'], backupIds: ['b1', 'b2'] })
    expect(diff.primary).toEqual({ from: 'p1', to: 'o1', changed: true })
    expect(diff.operators.removed).toEqual(['o1'])
    expect(diff.changed).toBe(true)
  })

  it('separates added from removed operators', () => {
    const diff = diffPeopleChain(snapshot, { primary: 'p1', operatorIds: ['o2', 'o3'], backupIds: ['b1', 'b2'] })
    expect(diff.operators.added).toEqual(['o3'])
    expect(diff.operators.removed).toEqual(['o1'])
  })

  it('flags a pure backup reorder only when membership is unchanged', () => {
    const reordered = diffPeopleChain(snapshot, { primary: 'p1', operatorIds: ['o1', 'o2'], backupIds: ['b2', 'b1'] })
    expect(reordered.backups.reordered).toBe(true)
    expect(reordered.backups.added).toEqual([])
    expect(reordered.backups.removed).toEqual([])
    expect(reordered.changed).toBe(true)

    const membershipChange = diffPeopleChain(snapshot, { primary: 'p1', operatorIds: ['o1', 'o2'], backupIds: ['b2', 'b3'] })
    expect(membershipChange.backups.reordered).toBe(false)
  })

  it('treats duplicate ids as one seat', () => {
    const diff = diffPeopleChain(snapshot, { primary: 'p1', operatorIds: ['o1', 'o1', 'o2'], backupIds: ['b1', 'b2'] })
    expect(diff.changed).toBe(false)
  })
})

describe('COVERAGE_CAPABILITY_PARITY', () => {
  const coverage = readFileSync(
    'src/app/api/team/profiles/[profileId]/coverage/route.ts',
    'utf8',
  )
  const workspace = readFileSync(
    'src/components/team/person-profiles-workspace.tsx',
    'utf8',
  )

  it('the per-profile writer accepts the same capability as the bulk writer', () => {
    expect(coverage).toContain("can(ctx, 'MANAGE_REVENUE_IDENTITIES')")
    expect(coverage).not.toMatch(/if \(!ctx\.isAdmin\) return NextResponse/)
  })

  it('identity write actions are hidden from roles that cannot write', () => {
    expect(workspace).toContain('canManageIdentities')
    expect(workspace).toContain('{canManageIdentities && (')
    expect(workspace).toContain('Add account')
    expect(readFileSync('src/components/team/team-profiles-table.tsx', 'utf8')).toContain(
      'canManageIdentities',
    )
  })
})

describe('MANAGE_PEOPLE_DIALOG_CONTRACT', () => {
  const source = readFileSync('src/components/coverage/manage-people-dialog.tsx', 'utf8')

  it('persists through the canonical coverage writer only', () => {
    expect(source).toContain('/api/team/profiles/${profileId}/coverage')
    expect(source).not.toContain('from(\'identity_assignments\')')
    expect(source).not.toContain('from("identity_assignments")')
  })

  it('requires an explicit review before the write', () => {
    expect(source).toContain("useState<'edit' | 'review'>('edit')")
    expect(source).toContain('Confirm & save')
  })

  it('never writes a seat that contradicts another seat', () => {
    expect(source).toContain('!operatorIds.includes(id)')
    expect(source).toContain('id !== primary')
  })
})
