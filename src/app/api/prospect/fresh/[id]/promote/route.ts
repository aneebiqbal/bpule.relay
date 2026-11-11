import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { emitAction } from '@/lib/action-ledger'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { orgDate } from '@/lib/org-clock'
import { createServiceSupabase } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/**
 * Promote a Fresh Prospect to a canonical lead.
 *
 * Uses the SAME `createLead` service as the manual Prospect flow (§4), then links
 * the candidate and its enriched contact to the new lead. Duplicates are handled
 * by `createLead` itself, so a provider person can never create two leads.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { id } = await params
  const store = await createScoutStore()
  const client = await createServerSupabase()

  const { data: candidate, error } = await client
    .from('captured_prospects')
    .select('id, provider, provider_person_id, extracted_name, extracted_company, extracted_title, extracted_location, linkedin_url, canonical_score, canonical_intelligence, score_breakdown, revenue_identity_id, sender_profile_id')
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .maybeSingle()
  if (error) throw error
  if (!candidate) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 })
  if (candidate.provider_person_id == null) {
    return NextResponse.json({ error: 'This candidate was not created by a provider.' }, { status: 400 })
  }

  const company = (candidate.extracted_company as string) || (candidate.extracted_name as string)
  if (!company) {
    return NextResponse.json({ error: 'The candidate has no company to create a lead for.' }, { status: 400 })
  }

  // §27: enrichment/discovery never creates an ownership mechanism. The
  // promoting rep must be able to EXECUTE the suggested sender under the V6
  // responsibility authority — never silently substituted.
  const revenueIdentityId = (candidate.revenue_identity_id as string) ?? null
  const senderProfileId = (candidate.sender_profile_id as string) ?? null
  if (revenueIdentityId || senderProfileId) {
    // The policy is org configuration; read it with the service boundary so a
    // rep without a direct policy read still gets the correct business date.
    const policy = await loadOperatingPolicy(authCtx.orgId, createServiceSupabase())
    const businessDate = orgDate(new Date(), policy.timezone)
    const executable = await listExecutableIdentitiesForRep(client, authCtx.orgId, authCtx.repId, businessDate)
    const executableIds = new Set(executable.map((row) => row.id))
    const executableProfiles = new Set(executable.map((row) => row.profileId).filter(Boolean))
    const identityOk = !revenueIdentityId || executableIds.has(revenueIdentityId)
    const profileOk = !senderProfileId || executableProfiles.has(senderProfileId)
    if (!identityOk || !profileOk) {
      return NextResponse.json(
        { error: 'You cannot send from the suggested identity. Choose an identity you can execute.', code: 'IDENTITY_NOT_EXECUTABLE' },
        { status: 403 },
      )
    }
  }

  const result = await store.createLead({
    company,
    contactName: (candidate.extracted_name as string) ?? undefined,
    contactTitle: (candidate.extracted_title as string) ?? undefined,
    locationRaw: (candidate.extracted_location as string) ?? undefined,
    url: (candidate.linkedin_url as string) ?? undefined,
    rawInput: `${candidate.provider}:${candidate.provider_person_id}`,
    revenueIdentityId: (candidate.revenue_identity_id as string) ?? undefined,
    senderProfileId: (candidate.sender_profile_id as string) ?? undefined,
    source: 'linkedin',
    direction: 'outbound',
    canonicalScore: candidate.canonical_score as number | null | undefined,
    canonicalIntelligence: candidate.canonical_intelligence as never,
    scoreBreakdown: candidate.score_breakdown as never,
    isTest: false,
  })

  // A provider person is deduped by provider_person_id AND by the canonical lead
  // company key. If createLead found an existing lead, that is the one lead.
  const leadId = result.lead?.id as string | undefined
  if (!leadId) {
    return NextResponse.json(
      { ok: true, duplicate: true, existingLeadArchived: result.existingLeadArchived, lead: result.lead ?? null },
      { status: 200 },
    )
  }

  await store.updateCapturedProspectStatus(id, 'converted', leadId)
  await client
    .from('contact_points')
    .update({ lead_id: leadId })
    .is('lead_id', null)
    .eq('person_id', candidate.provider_person_id)

  await emitAction({
    orgId: authCtx.orgId,
    actionType: 'OPPORTUNITY_CREATED',
    actorType: 'rep',
    actorId: authCtx.repId,
    channel: 'linkedin',
    leadId,
    // Creating a lead is GENERATED work — it is not a sent action (§30).
    executionStatus: 'generated',
    metadata: { provider: candidate.provider, candidateId: id },
    idempotencyKey: `prospect:promoted:${candidate.provider_person_id}:${leadId}`,
  })

  return NextResponse.json({ ok: true, leadId, duplicate: false })
}
