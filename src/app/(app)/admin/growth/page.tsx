import { GrowthDashboard } from '@/components/admin/growth-dashboard'
import { requireProductAdmin } from '@/lib/auth/admin-page'

export const dynamic = 'force-dynamic'

export default async function AdminGrowthPage() {
  await requireProductAdmin()

  return <GrowthDashboard />
}
