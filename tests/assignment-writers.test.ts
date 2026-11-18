import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('CANONICAL_ASSIGNMENT_WRITERS', () => {
  const route = read('src/app/api/admin/revenue-identities/[id]/assign/route.ts')

  it('the admin revenue-identity assign route funnels through the canonical service', () => {
    expect(route).toContain('addOperatorResponsibility')
    expect(route).toContain('removeOperatorResponsibility')
  })

  it('it never writes identity_assignments directly', () => {
    expect(route).not.toContain("from('identity_assignments')")
    expect(route).not.toContain('from("identity_assignments")')
  })

  it('it does not seed targets while assigning', () => {
    expect(route).not.toContain('ensureDefaultDailyTargetsAdmin')
    expect(route).not.toContain('daily_target_plans')
  })
})

describe('EXECUTION_SCOPE_CANDIDATES', () => {
  const access = read('src/lib/coverage/access.ts')

  it('includes the active channels of every profile the rep holds a seat on', () => {
    expect(access).toContain('seatedProfileIds')
    expect(access).toContain('seatedIdentityIds')
  })
})
