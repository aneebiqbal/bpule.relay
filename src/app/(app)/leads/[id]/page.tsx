import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { LeadWorkspaceAsync } from '@/components/lead-workspace-async'
import { LeadDetailSkeleton } from '@/components/sales/lead-detail-skeleton'

export const dynamic = 'force-dynamic'

interface LeadPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const LEAD_TABS = ['conversation', 'tasks', 'activity'] as const

async function loadLeadData(id: string) {
  const store = await createScoutStore()

  const [lead, profiles, queue] = await Promise.all([
    store.getLead(id),
    store.listProfiles(),
    store.getQueue(),
  ])
  if (!lead) notFound()

  // Owner attribution for the context panel — a name, never a raw uuid.
  const owner = lead.ownerRepId ? await store.getRepInfo(lead.ownerRepId).catch(() => null) : null

  return { lead, profiles, dailyLimit: queue.dailyLimit, todaySends: queue.todaySends, ownerName: owner?.name ?? null }
}

export default async function LeadPage({ params, searchParams }: LeadPageProps) {
  const dataPromise = params.then(async ({ id }) => loadLeadData(id))
  const raw = await searchParams
  const rawTab = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab
  const rawNext = Array.isArray(raw.next) ? raw.next[0] : raw.next
  const initialTab = LEAD_TABS.includes(rawTab as (typeof LEAD_TABS)[number])
    ? (rawTab as (typeof LEAD_TABS)[number])
    : 'overview'

  return (
    <Suspense fallback={<LeadDetailSkeleton />}>
      <LeadWorkspaceAsync
        dataPromise={dataPromise}
        initialTab={initialTab}
        initialNext={rawNext ?? null}
        now={Date.now()}
      />
    </Suspense>
  )
}
