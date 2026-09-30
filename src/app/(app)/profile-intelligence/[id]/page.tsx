import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { ProfileDetail } from '@/components/profile-intelligence/profile-detail'

export const dynamic = 'force-dynamic'

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return <ProfileDetail profileId={id} />
}
