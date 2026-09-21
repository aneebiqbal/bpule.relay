import { redirect } from 'next/navigation'
import { getCurrentUser } from './current'
import { getAuthContext } from './organization'

/**
 * Growth Engine Authorization
 *
 * The Relay Growth Engine is admin-only. These helpers enforce that
 * at the route level and API level.
 */

export async function hasGrowthAccess(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  if (user.rep.role === 'admin') return true
  const authCtx = await getAuthContext()
  return Boolean(authCtx?.isOwner || authCtx?.isAdmin)
}

export async function requireGrowthAccess(): Promise<{
  repId: string
  orgId: string
  orgName: string
}> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (!(await hasGrowthAccess())) {
    redirect('/dashboard')
  }

  return {
    repId: user.rep.id,
    orgId: user.organization.id,
    orgName: user.organization.name,
  }
}

export async function assertGrowthAccessAPI(): Promise<{
  repId: string
  orgId: string
}> {
  const user = await getCurrentUser()
  if (!user) {
    throw new GrowthAuthError('Not signed in.', 401)
  }
  if (!(await hasGrowthAccess())) {
    throw new GrowthAuthError('Admin access required.', 403)
  }
  return {
    repId: user.rep.id,
    orgId: user.organization.id,
  }
}

export class GrowthAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'GrowthAuthError'
  }
}
