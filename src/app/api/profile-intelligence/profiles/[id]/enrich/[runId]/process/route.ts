import { NextResponse } from 'next/server'
import { processNextEnrichmentSource } from '@/lib/profile-intelligence/enrichment-service'
import { aiSourceExtractor } from '@/lib/profile-intelligence/enrichment-extract'
import { assertRunForProfile, enrichmentErrorResponse, requireProfileManager } from '@/lib/profile-intelligence/enrichment-http'

export const maxDuration = 120

/**
 * Extracts ONE source per call (the client polls until done), then builds the
 * dry-run diff. Never writes to the profile or its relationships.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: profileId, runId } = await params
  const gate = await requireProfileManager()
  if ('response' in gate) return gate.response
  try {
    const client = await assertRunForProfile(gate.auth.orgId, profileId, runId)
    const result = await processNextEnrichmentSource(client, { orgId: gate.auth.orgId, runId, extractor: aiSourceExtractor })
    return NextResponse.json(result)
  } catch (err) {
    return enrichmentErrorResponse(err, 'profile-enrich:process')
  }
}
