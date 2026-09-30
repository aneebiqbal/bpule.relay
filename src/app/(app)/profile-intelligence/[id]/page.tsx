import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { profileAccess } from '@/lib/profile-intelligence/access'
import { ProfileDetail } from '@/components/profile-intelligence/profile-detail'

export const dynamic = 'force-dynamic'

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  const access = profileAccess(authCtx)
  return <ProfileDetail profileId={id} canImport={access.canManage} isAdmin={access.canMerge} />
}
