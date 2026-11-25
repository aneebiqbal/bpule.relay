import { redirect } from 'next/navigation'
import { requireProductAdmin } from '@/lib/auth/admin-page'
import { HandoffAdmin } from '@/components/admin/handoff-admin'

export const dynamic = 'force-dynamic'

/** Admin → Handoffs — Transfer Responsibilities. */
export default async function AdminHandoffPage() {
  await requireProductAdmin()
  return <HandoffAdmin />
}
