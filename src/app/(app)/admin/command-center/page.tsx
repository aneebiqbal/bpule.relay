import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { loadOrgCommandSnapshot } from '@/lib/admin/org-command-snapshot'
import { OwnerCommandCenter, OwnerCommandCenterSkeleton } from '@/components/admin/owner-command-center'

export const dynamic = 'force-dynamic'

export default async function CommandCenterPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (user.rep.role !== 'admin' && !authCtx?.isOwner && !authCtx?.isAdmin) {
    redirect('/dashboard')
  }

  const dataPromise = loadOrgCommandSnapshot()

  return (
    <Suspense fallback={<OwnerCommandCenterSkeleton />}>
      <OwnerCommandCenter dataPromise={dataPromise} />
    </Suspense>
  )
}
