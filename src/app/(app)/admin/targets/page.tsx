import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { TargetsManager } from '@/components/targets-manager'

export const dynamic = 'force-dynamic'

export default async function TargetsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.rep.role !== 'admin') redirect('/dashboard')

  return <TargetsManager />
}
