import { redirect } from 'next/navigation'
import { requireProductAdmin } from '@/lib/auth/admin-page'

export const dynamic = 'force-dynamic'

/** Compatibility: the command center lives at /admin/command. */
export default async function AdminCommandCenterRedirect() {
  await requireProductAdmin()
  redirect('/admin/command')
}
