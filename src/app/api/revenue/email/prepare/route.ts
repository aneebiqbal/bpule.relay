import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createScoutStore } from '@/lib/store'
import { prepareEmailDraft } from '@/lib/email/service'
import { safeErrorResponse } from '@/lib/errors'
import { isPremium } from '@/lib/billing/premium'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: {
    leadIds?: string[]
    revenueIdentityId?: string | null
    generationMode?: 'standard' | 'premium'
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const leadIds = Array.isArray(body.leadIds)
    ? [...new Set(body.leadIds.map((id) => String(id).trim()).filter(Boolean))]
    : []
  if (leadIds.length === 0) {
    return NextResponse.json({ error: 'leadIds are required.' }, { status: 400 })
  }

  try {
    const store = await createScoutStore()
    const client = await createServerSupabase()

    const prepared: Array<{ leadId: string; draftId: string; status: string; blockedReason: string | null }> = []
    const failures: Array<{ leadId: string; error: string }> = []

    for (const leadId of leadIds) {
      try {
        const draft = await prepareEmailDraft({
          client,
          store,
          orgId: store.organizationId,
          repId: store.getCurrentRepId(),
          leadId,
          preferredIdentityId: body.revenueIdentityId ?? null,
          // Premium generation mode gate: only premium orgs may use the
          // stronger AI model. A free user requesting 'premium' is downgraded.
          generationMode: body.generationMode === 'premium' && isPremium(store.getPlan())
            ? 'premium'
            : 'standard',
        })
        prepared.push({
          leadId,
          draftId: draft.id,
          status: draft.draftStatus,
          blockedReason: draft.blockedReason,
        })
      } catch (error) {
        failures.push({
          leadId,
          error: error instanceof Error ? error.message : 'Failed to prepare draft.',
        })
      }
    }

    const summary = {
      READY: prepared.filter((p) => p.status === 'READY').length,
      RESEARCH_REQUIRED: prepared.filter((p) => p.status === 'RESEARCH_REQUIRED').length,
      CONTACT_NOT_FOUND: prepared.filter((p) => p.status === 'CONTACT_NOT_FOUND' || p.status === 'NEEDS_VERIFIED_CONTACT').length,
      NEEDS_VERIFIED_CONTACT: prepared.filter((p) => p.status === 'NEEDS_VERIFIED_CONTACT').length,
      SKIP: prepared.filter((p) => p.status === 'SKIP').length,
      FAILED: prepared.filter((p) => p.status === 'FAILED').length,
    }

    return NextResponse.json({
      prepared,
      failures,
      summary,
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to prepare email batch.', 'revenue/email/prepare')
  }
}
