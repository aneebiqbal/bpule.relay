import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { GrowthDashboard } from '@/components/admin/growth-dashboard'

export const dynamic = 'force-dynamic'

export default async function AdminGrowthPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const authCtx = await getAuthContext()
  if (user.rep.role !== 'admin' && !authCtx?.isOwner && !authCtx?.isAdmin) {
    redirect('/dashboard')
  }

  return <GrowthDashboard />
}
