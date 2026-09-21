import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { GrowthEngineDashboard, GrowthEngineSkeleton } from '@/components/growth/growth-engine-dashboard'
import type { CurrentUser } from '@/lib/auth/current'

export const dynamic = 'force-dynamic'

async function loadGrowthData(user: CurrentUser) {
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
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const authCtx = await getAuthContext()
  if (user.rep.role !== 'admin' && !authCtx?.isOwner && !authCtx?.isAdmin) {
    redirect('/dashboard')
  }

  const dataPromise = loadGrowthData(user)

  return (
    <Suspense fallback={<GrowthEngineSkeleton />}>
      <GrowthEngineDashboard dataPromise={dataPromise} />
    </Suspense>
  )
}
