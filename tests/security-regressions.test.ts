/**
 * Targeted regressions for the security fixes from the stabilization pass:
 *   R-04 — organization deletion revokes sessions before deleting users;
 *   R-05 — login `next` normalization rejects off-site redirects.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORG = '11111111-1111-1111-1111-111111111111'

function chain(result: unknown) {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.delete = () => builder
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

const { deleteUser, signOutUser } = vi.hoisted(() => ({
  deleteUser: vi.fn(async () => undefined),
  signOutUser: vi.fn(async () => undefined),
}))

vi.mock('@/lib/auth/provider', () => ({
  getAuthProvider: async () => ({ deleteUser, signOutUser }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabase: () => ({
    from: (table: string) => {
      if (table === 'reps') return chain({ data: [{ id: 'r1', auth_user_id: 'u1' }, { id: 'r2', auth_user_id: 'u2' }], error: null })
      if (table === 'organizations') return chain({ data: null, error: null })
      return chain({ data: null, error: null })
    },
  }),
}))

vi.mock('@/lib/auth/organization', () => ({
  getAuthContext: async () => ({ orgId: ORG, repId: 'admin-1' }),
  can: () => true,
}))

describe('R-04 organization deletion', () => {
  beforeEach(() => {
    deleteUser.mockClear()
    signOutUser.mockClear()
  })

  it('revokes every member session before deleting the user', async () => {
    const { DELETE } = await import('@/app/api/organization/delete/route')
    const response = await DELETE()
    expect(response.status).toBe(200)
    expect(signOutUser).toHaveBeenCalledTimes(2)
    expect(deleteUser).toHaveBeenCalledTimes(2)
    // Revocation must be attempted for each member before its deletion.
    const calls = [...signOutUser.mock.invocationCallOrder, ...deleteUser.mock.invocationCallOrder].sort((a, b) => a - b)
    expect(calls).toHaveLength(4)
  })
})

describe('R-05 login next-path normalization', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/leads/123?tab=conversation', '/leads/123?tab=conversation'],
    ['//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['https://evil.example', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    [null, '/dashboard'],
  ])('sanitizes %p to %p', async (input, expected) => {
    const { sanitizeNextPath } = await import('@/components/auth/next-path')
    expect(sanitizeNextPath(input)).toBe(expected)
  })
})
