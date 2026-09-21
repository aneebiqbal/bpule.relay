import { requireProductAdmin } from '@/lib/auth/admin-page'
import { RevenueIntelligenceDashboard } from '@/components/admin/revenue-intelligence-dashboard'

export const maxDuration = 30

export default async function RevenueIntelligencePage() {
  const { user } = await requireProductAdmin()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Revenue Intelligence</h1>
        <span className="text-sm text-muted-foreground">Org: {user.organization.name}</span>
      </div>
      <RevenueIntelligenceDashboard />
    </div>
  )
}
