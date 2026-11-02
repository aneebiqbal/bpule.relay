import { Suspense } from 'react'
import { createScoutStore } from '@/lib/store'
import { LeadProbe } from '@/components/lead-probe'

export const dynamic = 'force-dynamic'

interface LeadPageProps {
  params: Promise<{ id: string }>
}

async function loadLeadId(id: string) {
  const store = await createScoutStore()
  const lead = await store.getLead(id)
  if (!lead) throw new Error('not found')
  return { id: lead.id }
}

export default function LeadPage({ params }: LeadPageProps) {
  const dataPromise = params.then(async ({ id }) => loadLeadId(id))
  return (
    <Suspense fallback={<div>loading</div>}>
      <LeadProbe promise={dataPromise} />
    </Suspense>
  )
}
