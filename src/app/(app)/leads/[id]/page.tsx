import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { computeScore } from '@/lib/score/rubric'
import { LeadWorkspaceAsync } from '@/components/lead-workspace-async'
import { SkeletonText, SkeletonCircle, Skeleton } from '@/components/ui/skeleton'

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
      <section className="overflow-hidden rounded-lg border border-line bg-bone-raised">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 space-y-3 p-5 sm:p-6">
            <SkeletonText className="h-3 w-24" />
            <SkeletonText className="h-3 w-32" />
            <SkeletonText className="h-5 w-48" />
            <SkeletonText className="h-3.5 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
          <div className="flex shrink-0 flex-col items-center justify-center gap-3 border-t border-line bg-surface-muted p-5 lg:border-t-0 lg:border-l lg:px-8">
            <SkeletonCircle className="size-[88px]" />
            <SkeletonText className="h-3 w-16" />
          </div>
        </div>
      </section>
      <div className="rounded-lg border border-line bg-bone-raised p-4">
        <SkeletonText className="h-3.5 w-28" />
        <SkeletonText className="mt-2 h-4 w-40" />
      </div>
      <div className="space-y-4 rounded-lg border border-line bg-bone-raised p-5">
        <SkeletonText className="h-4 w-20" />
        <div className="mt-4 flex gap-1 rounded-lg bg-surface-muted p-1">
          {['DM', 'Connection', 'Upwork', 'Follow-up', 'Reply'].map((label) => (
            <Skeleton key={label} className="h-7 w-20 rounded-md" />
          ))}
        </div>
        <Skeleton className="mt-4 h-40 w-full rounded-md border border-line" />
      </div>
    </div>
  )
}
