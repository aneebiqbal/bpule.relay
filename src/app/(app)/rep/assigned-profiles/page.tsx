import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { AssignedProfilesView } from '@/components/assigned-profiles'

export const dynamic = 'force-dynamic'

export default async function AssignedProfilesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return <AssignedProfilesView />
}
