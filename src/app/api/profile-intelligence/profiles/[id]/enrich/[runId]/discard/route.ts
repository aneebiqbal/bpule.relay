import { NextResponse } from 'next/server'
import { discardEnrichmentRun } from '@/lib/profile-intelligence/enrichment-service'
import { assertRunForProfile, enrichmentErrorResponse, requireProfileManager } from '@/lib/profile-intelligence/enrichment-http'

/** Marks an unapplied import as discarded. The profile is never touched. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: profileId, runId } = await params
  const gate = await requireProfileManager()
  if ('response' in gate) return gate.response
  try {
    const client = await assertRunForProfile(gate.auth.orgId, profileId, runId)
    return NextResponse.json({ run: await discardEnrichmentRun(client, gate.auth.orgId, runId) })
  } catch (err) {
    return enrichmentErrorResponse(err, 'profile-enrich:discard')
  }
}
