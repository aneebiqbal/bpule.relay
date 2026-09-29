import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'

export const dynamic = 'force-dynamic'

export default async function GrowthEnginePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (user.rep.role !== 'admin' && !authCtx?.isOwner && !authCtx?.isAdmin) {
    redirect('/dashboard')
  }

  redirect('/content-v2/growth')
}
