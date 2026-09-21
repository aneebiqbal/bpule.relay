import { requireProductAdmin } from '@/lib/auth/admin-page'
import { TargetsManager } from '@/components/targets-manager'

export const dynamic = 'force-dynamic'

export default async function TargetsPage() {
  await requireProductAdmin()
  return <TargetsManager />
}
