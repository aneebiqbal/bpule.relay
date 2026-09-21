import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { GrowthEngineDashboard } from '@/components/growth/growth-engine-dashboard'
import { GrowthEngineSkeleton } from '@/components/growth/growth-engine-dashboard'

export const dynamic = 'force-dynamic'

async function loadGrowthData() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.rep.role !== 'admin') redirect('/dashboard')

  const res = await fetch('/api/growth/today', {
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error('Failed to load growth data')
  }

  const data = await res.json()

  return {
    repName: user.rep.name,
    orgName: user.organization.name,
    memory: [],
    events: [],
    decision: data.decision,
    draft: data.draft,
    opportunities: data.opportunities || [],
    today: new Date().toISOString().slice(0, 10),
  }
}

export default async function GrowthEnginePage() {
  const dataPromise = loadGrowthData()

  return (
    <Suspense fallback={<GrowthEngineSkeleton />}>
      <GrowthEngineDashboard dataPromise={dataPromise} />
    </Suspense>
  )
}
