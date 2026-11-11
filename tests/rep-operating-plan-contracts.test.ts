import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { personNameFromProfile } from '@/lib/profiles/person-name'
import { normalizeChannel } from '@/lib/profiles/channel'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Rep Operating Plan contracts — the invariants that keep every surface from
 * growing its own assignment/target truth.
 */
describe('REP_OPERATING_PLAN_EXECUTABLE_ONLY', () => {
  it('the operating plan reads the canonical execution scope', () => {
    const source = read('src/lib/operations/rep-operating-plan.ts')
    expect(source).toContain('listExecutableIdentitiesForRep')
    expect(source).not.toContain("from('identity_assignments')")
  })

  it('rep accountability reads the canonical scope, not raw assignments', () => {
    const source = read('src/lib/store/supabase-store.ts')
    expect(source).toContain('listExecutableIdentitiesForRep')
  })

  it('the canonical scope is PRIMARY + OPERATOR + active coverage and excludes archived/backup-only', () => {
    const source = read('src/lib/coverage/access.ts')
    expect(source).toContain(".in('role', ['PRIMARY', 'OPERATOR'])")
    expect(source).toContain("eq('status', 'ACTIVE')")
    expect(source).toContain("if (row.status !== 'active') continue")
  })

  it('normalizeChannel lives in a leaf module so the scope has no store cycle', () => {
    const source = read('src/lib/profiles/channel.ts')
    expect(source).not.toContain('@/lib/store')
    expect(source).not.toContain('@/lib/auth/workspace')
  })
})

describe('PRIMARY_ASSIGNMENT_CREATES_EXECUTION', () => {
  it('the assignment module writes eligibility, PRIMARY coverage and the channel plan', () => {
    const source = read('src/lib/profiles/assignment.ts')
    expect(source).toContain("from('identity_assignments')")
    expect(source).toContain("from('profile_coverage')")
    expect(source).toContain("from('daily_target_plans')")
    expect(source).toContain("role: 'PRIMARY'")
  })

  it('onboarding assigns through the canonical module', () => {
    const source = read('src/app/api/team/profile-onboarding/route.ts')
    expect(source).toContain('assignPrimaryResponsibility')
  })
})

describe('BACKUP_HAS_NO_DAILY_TARGET', () => {
  it('a backup assignment writes no target lane', () => {
    const source = read('src/lib/profiles/assignment.ts')
    const backup = source.slice(source.indexOf('assignBackupResponsibility'))
    const body = backup.slice(0, backup.indexOf('export async function removeResponsibility'))
    expect(body).toContain("role: 'BACKUP'")
    expect(body).not.toContain("from('daily_target_plans')")
  })
})

describe('ASSIGNMENT_AND_TARGET_ATOMIC', () => {
  it('the responsibility route is admin-gated and org-scoped', () => {
    const source = read('src/app/api/admin/responsibilities/route.ts')
    expect(source).toContain("can(authCtx, 'MANAGE_REVENUE_IDENTITIES')")
    expect(source).toContain('auth.authCtx.orgId')
  })
})

describe('TARGET_EDITOR_SCOPED_BY_REP_IDENTITY_ACTIVITY', () => {
  it('the profile channel editor shows the channel plan\'s targetable lanes', () => {
    const source = read('src/lib/profiles/operating-model.ts')
    expect(source).toContain('row.targetable')
  })

  it('admin targets returns only executable lanes', () => {
    const source = read('src/app/api/admin/targets/route.ts')
    expect(source).toContain('primaryByProfileRep')
    expect(source).toContain('coveredByProfileRep')
    expect(source).toContain('executableTargets')
  })
})

describe('REMOVE_ASSIGNMENT_PRESERVES_PLAN', () => {
  it('removing a responsibility retires coverage and leaves the channel plan alone', () => {
    const source = read('src/lib/profiles/assignment.ts')
    const remove = source.slice(source.indexOf('export async function removeResponsibility'))
    const body = remove.slice(0, remove.indexOf('export async function transferResponsibility'))
    expect(body).toContain("from('profile_coverage')")
    expect(body).not.toContain("from('daily_target_plans')")
    expect(body).toContain('active: false')
  })
})

describe('TRANSFER_PRESERVES_HISTORY', () => {
  it('transferring keeps the channel plan and never touches leads/messages', () => {
    const source = read('src/lib/profiles/assignment.ts')
    const transfer = source.slice(source.indexOf('export async function transferResponsibility'))
    expect(transfer).not.toContain("from('daily_target_plans')")
    expect(transfer).not.toContain("from('leads')")
    expect(transfer).not.toContain("from('messages')")
  })
})

describe('REP_HOME_EQUALS_ADMIN_PLAN', () => {
  it('Rep Detail renders the canonical operating plan', () => {
    const source = read('src/app/(app)/team/[repId]/page.tsx')
    expect(source).toContain('loadRepOperatingPlan')
    expect(source).toContain('RepOperatingPlanView')
  })

  it('the Rep Detail overview no longer renders the reporting pipeline strip', () => {
    const source = read('src/app/(app)/team/[repId]/page.tsx')
    expect(source).not.toContain('title="Pipeline"')
  })
})

describe('PERSON_GROUPS_CHANNELS', () => {
  it('personNameFromProfile strips the channel suffix from sender labels', () => {
    expect(personNameFromProfile({ display_name: null, full_name: null, label: 'Zaira Upwork' })).toBe('Zaira')
    expect(personNameFromProfile({ display_name: null, full_name: null, label: 'Mehak, LinkedIn' })).toBe('Mehak')
    expect(personNameFromProfile({ display_name: 'Madiha Irfan', full_name: null, label: null })).toBe('Madiha Irfan')
  })

  it('channels normalize case and separators', () => {
    expect(normalizeChannel('LinkedIn')).toBe('linkedin')
    expect(normalizeChannel('UP_WORK')).toBe('upwork')
    expect(normalizeChannel(null)).toBe('other')
  })
})
