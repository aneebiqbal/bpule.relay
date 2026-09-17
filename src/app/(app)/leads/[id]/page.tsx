import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { computeScore } from '@/lib/score/rubric'
import { LeadWorkspaceAsync } from '@/components/lead-workspace-async'

export const dynamic = 'force-dynamic'

interface LeadPageProps {
  params: Promise<{ id: string }>
}

async function loadLeadData(id: string) {
  const store = await createScoutStore()

  const [lead, rulebook, profiles] = await Promise.all([
    store.getLead(id),
    store.getRulebook(),
    store.listProfiles(),
  ])
  if (!lead) notFound()

  const score = computeScore({
    name: lead.contactName,
    title: lead.contactTitle,
    company: lead.company,
    url: lead.url,
    signalType: lead.signalType ?? 7,
    signalEvidence: lead.signalEvidence ?? '',
    verbatimQuote: lead.verbatimQuote,
    tags: lead.tags ?? [],
  }, rulebook!)

  const matchedProofs = await store.matchProofItems(lead.tags ?? [], 5)

  return { lead, score, profiles, matchedProofs }
}

export default function LeadPage({ params }: LeadPageProps) {
  const dataPromise = params.then(async ({ id }) => loadLeadData(id))

  return (
    <Suspense fallback={<LeadShellSkeleton />}>
      <LeadWorkspaceAsync dataPromise={dataPromise} />
    </Suspense>
  )
}

function LeadShellSkeleton() {
  return (
    <div className="space-y-4">
      <section className="reveal-up rounded-2xl border border-line/80 bg-bone-raised overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 p-5 sm:p-6">
            <div className="h-4 w-24 rounded bg-bone" />
            <div className="mt-3 h-4 w-32 rounded bg-bone" />
            <div className="mt-2 h-7 w-48 max-w-full rounded bg-bone" />
            <div className="mt-0.5 h-3.5 w-40 max-w-full rounded bg-bone" />
            <div className="mt-3 flex items-center gap-1.5">
              <div className="h-5 w-20 rounded-lg bg-bone" />
              <div className="h-5 w-24 rounded-lg bg-bone" />
            </div>
            <div className="mt-4 h-16 w-full rounded-xl bg-bone" />
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center gap-3 border-t border-line/40 bg-bone/20 p-5 lg:border-t-0 lg:border-l lg:px-8">
            <div className="size-[88px] rounded-full bg-bone" />
            <div className="h-3 w-16 rounded bg-bone" />
          </div>
        </div>
      </section>
      <div className="rounded-xl border border-line bg-bone-raised p-4">
        <div className="h-3.5 w-28 rounded bg-bone" />
        <div className="mt-2 h-4 w-40 max-w-full rounded bg-bone" />
      </div>
      <div className="space-y-4 rounded-2xl border border-line/60 bg-bone-raised p-5">
        <div className="h-4 w-20 rounded bg-bone" />
        <div className="mt-4 flex flex-wrap gap-1 rounded-xl bg-bone/50 p-1">
          {['DM', 'Connection', 'Upwork', 'Follow-up', 'Reply'].map((label) => (
            <div key={label} className="h-7 w-20 rounded-lg bg-bone" />
          ))}
        </div>
        <div className="mt-4 h-40 w-full rounded border border-line bg-bone/40" />
      </div>
    </div>
  )
}
