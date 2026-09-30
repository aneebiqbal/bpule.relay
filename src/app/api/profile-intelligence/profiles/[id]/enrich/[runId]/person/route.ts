import { NextResponse } from 'next/server'
import { selectEnrichmentPerson } from '@/lib/profile-intelligence/enrichment-service'
import { assertRunForProfile, enrichmentErrorResponse, requireProfileManager } from '@/lib/profile-intelligence/enrichment-http'

/**
 * Body: { person: string | null } — which person in a multi-person source this
 * profile is. Rebuilds the dry-run diff only; the profile is not modified.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: profileId, runId } = await params
  const gate = await requireProfileManager()
  if ('response' in gate) return gate.response
  const body = await request.json().catch(() => ({}))
  const person = typeof body?.person === 'string' && body.person.trim() ? body.person : null
  try {
    const client = await assertRunForProfile(gate.auth.orgId, profileId, runId)
    return NextResponse.json({ run: await selectEnrichmentPerson(client, gate.auth.orgId, runId, person) })
  } catch (err) {
    return enrichmentErrorResponse(err, 'profile-enrich:person')
  }
}
