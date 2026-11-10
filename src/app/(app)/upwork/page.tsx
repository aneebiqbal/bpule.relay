import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { loadUpworkDashboard } from '@/lib/upwork/dashboard'
import { UpworkDashboardView } from '@/components/upwork/dashboard'

export const dynamic = 'force-dynamic'

export default async function UpworkPage() {
  const store = await createScoutStore()
  const auth = await getAuthContext()
  if (!auth) {
    return (
      <div className="space-y-6">
        <p className="text-[13px] text-graphite">Sign in to open Upwork.</p>
      </div>
    )
  }

  const [dashboard, policy] = await Promise.all([
    loadUpworkDashboard(store, auth),
    loadOperatingPolicy(auth.orgId),
  ])

  return (
    <UpworkDashboardView
      summary={dashboard.summary}
      views={dashboard.views}
      repNameById={Object.fromEntries(dashboard.repNameById)}
      profileNameById={Object.fromEntries(dashboard.profileNameById)}
      identityNameById={Object.fromEntries(dashboard.identityNameById)}
      isAdmin={Boolean(auth.isAdmin || auth.isOwner)}
      timezone={policy.timezone}
    />
  )
}
