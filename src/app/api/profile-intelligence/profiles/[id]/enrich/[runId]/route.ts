import { NextResponse } from 'next/server'
import { getRunOrThrow } from '@/lib/profile-intelligence/enrichment-service'
import { assertRunForProfile, enrichmentErrorResponse, requireProfileManager } from '@/lib/profile-intelligence/enrichment-http'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: profileId, runId } = await params
  const gate = await requireProfileManager()
  if ('response' in gate) return gate.response
  try {
    const client = await assertRunForProfile(gate.auth.orgId, profileId, runId)
    const run = await getRunOrThrow(client, gate.auth.orgId, runId)
    const { data: sources } = await client.from('profile_sources')
      .select('id, original_filename, mime_type, file_size_bytes, parsing_status, extraction_status, error_message')
      .in('id', run.source_ids.length ? run.source_ids : ['00000000-0000-0000-0000-000000000000'])
    return NextResponse.json({ run, sources: sources ?? [] })
  } catch (err) {
    return enrichmentErrorResponse(err, 'profile-enrich:get')
  }
}
