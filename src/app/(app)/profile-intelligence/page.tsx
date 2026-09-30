import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { ProfileIntelligenceDashboard } from '@/components/profile-intelligence/dashboard'
import { profileAccess } from '@/lib/profile-intelligence/access'

export const dynamic = 'force-dynamic'

export default async function ProfileIntelligencePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  const access = profileAccess(authCtx)
  return <ProfileIntelligenceDashboard orgId={authCtx.orgId} isAdmin={access.canMerge} canManage={access.canManage} />
}
