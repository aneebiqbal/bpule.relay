import { redirect } from 'next/navigation'
import { getCurrentUser } from './current'

/**
 * Growth Engine Authorization
 *
 * The Relay Growth Engine is admin-only. These helpers enforce that
 * at the route level and API level.
 */

export async function requireGrowthAccess(): Promise<{
  repId: string
  orgId: string
  orgName: string
}> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (user.rep.role !== 'admin') {
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
  if (user.rep.role !== 'admin') {
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
