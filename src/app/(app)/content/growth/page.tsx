import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { GrowthEngineDashboard, GrowthEngineSkeleton } from '@/components/growth/growth-engine-dashboard'

export const dynamic = 'force-dynamic'

async function loadGrowthData() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.rep.role !== 'admin') redirect('/dashboard')

  const today = new Date().toISOString().slice(0, 10)

  try {
    const store = await createScoutStore()
    const [memory, events, decision, opportunities] = await Promise.all([
      store.listGrowthMemory(true),
      store.listGrowthEvents(false),
      store.getEditorialDecision(today),
      store.listOpportunities(today),
    ])
    const draft = decision ? await store.getGrowthDraftByDecision(decision.id) : null

    return {
      repName: user.rep.name,
      orgName: user.organization.name,
      memory,
      events,
      decision,
      draft,
      opportunities,
      today,
    }
  } catch (error) {
    console.error('[growth] failed to load:', error)
    return {
      repName: user.rep.name,
      orgName: user.organization.name,
      memory: [],
      events: [],
      decision: null,
      draft: null,
      opportunities: [],
      today,
    }
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
