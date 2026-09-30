import { NextResponse } from 'next/server'
import { applyEnrichmentRun } from '@/lib/profile-intelligence/enrichment-service'
import type { Decision } from '@/lib/profile-intelligence/enrichment'
import { aiContextSynthesizer, assertRunForProfile, enrichmentErrorResponse, requireProfileManager } from '@/lib/profile-intelligence/enrichment-http'

export const maxDuration = 60

/**
 * Applies the reviewed diff to the SAME profile.id in one transaction.
 * Body: { decisions: { [changeId]: 'apply' | 'skip' } } — omitted ids use the
 * proposal's safe defaults. Duplicates can never be applied.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { id: profileId, runId } = await params
  const gate = await requireProfileManager()
  if ('response' in gate) return gate.response

  const body = await request.json().catch(() => ({}))
  const decisions: Record<string, Decision> = {}
  for (const [k, v] of Object.entries(body?.decisions ?? {})) if (v === 'apply' || v === 'skip') decisions[k] = v

  try {
    const client = await assertRunForProfile(gate.auth.orgId, profileId, runId)
    const result = await applyEnrichmentRun(client, {
      orgId: gate.auth.orgId, runId, actorRepId: gate.auth.repId, decisions, synthesize: aiContextSynthesizer,
    })
    return NextResponse.json(result)
  } catch (err) {
    return enrichmentErrorResponse(err, 'profile-enrich:apply')
  }
}
