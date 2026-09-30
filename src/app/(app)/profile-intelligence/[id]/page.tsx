import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext, can } from '@/lib/auth/organization'
import { ProfileDetail } from '@/components/profile-intelligence/profile-detail'

export const dynamic = 'force-dynamic'

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (!authCtx) redirect('/login')

  return (
    <ProfileDetail
      profileId={id}
      canImport={can(authCtx, 'MANAGE_REVENUE_IDENTITIES')}
      isAdmin={authCtx.isAdmin || authCtx.isOwner}
    />
  )
}
