import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { computeScore } from '@/lib/score/rubric'
import { LeadWorkspace } from '@/components/lead-workspace'

export const dynamic = 'force-dynamic'

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const store = await createScoutStore()
  const lead = await store.getLead(id)
  if (!lead) notFound()

  const rulebook = await store.getRulebook()

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

  const [profiles, matchedProofs] = await Promise.all([
    store.listProfiles(),
    store.matchProofItems(lead.tags ?? [], 5),
  ])

  return (
    <LeadWorkspace
      lead={lead}
      score={score}
      profiles={profiles}
      matchedProofs={matchedProofs}
    />
  )
}