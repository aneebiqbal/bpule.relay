/**
 * Lead Referral API — refer a lead to another rep/profile without duplication.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface ReferralParams {
  orgId: string
  leadId: string
  fromRepId: string
  toRepId: string
  toProfileId?: string
  reason?: string
}

interface ReferralResult {
  success: boolean
  error?: string
  actionEventId?: string
}

/**
 * Refer a lead to another rep/profile.
 * Preserves the same lead ID. Records in Action Ledger. Updates lead assignment.
 */
export async function referLead(params: ReferralParams): Promise<ReferralResult> {
  const { createServiceSupabase } = await import('@/lib/supabase/service')
  const supabase = createServiceSupabase()

  // 1. Update lead assignment
  const { error: updateError } = await supabase
    .from('leads')
    .update({
      owner_rep_id: params.toRepId,
      sender_profile_id: params.toProfileId || null,
      referred_by_rep_id: params.fromRepId,
      referred_to_rep_id: params.toRepId,
      referred_by_profile_id: params.toProfileId || null,
      referral_reason: params.reason || null,
      referral_at: new Date().toISOString(),
      status: 'new',  // reset status for receiving rep
    })
    .eq('id', params.leadId)
    .eq('organization_id', params.orgId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // 2. Emit action event
  const { emitAction } = await import('@/lib/action-ledger')
  const actionEventId = await emitAction({
    orgId: params.orgId,
    actionType: 'LEAD_REFERRED',
    actorType: 'rep',
    actorId: params.fromRepId,
    senderProfileId: params.toProfileId || null,
    leadId: params.leadId,
    referredToRepId: params.toRepId,
    referredToProfileId: params.toProfileId || null,
    referralReason: params.reason || null,
    metadata: {
      fromRepId: params.fromRepId,
      toRepId: params.toRepId,
    },
    idempotencyKey: `lead_referred:${params.leadId}:${params.toRepId ?? params.toProfileId ?? 'none'}`,
  })

  return { success: true, actionEventId: actionEventId || undefined }
}

/**
 * Get recommended profiles for a lead (for referral picker).
 */
export async function getReferralRecommendations(
  orgId: string,
  leadId: string,
  currentProfileId?: string,
): Promise<Array<{ profileId: string; identityName: string; matchScore: number; reason: string }>> {
  const { createServiceSupabase } = await import('@/lib/supabase/service')
  const supabase = createServiceSupabase()

  // Get lead's opportunity capabilities from V3 decision
  const { data: lead } = await supabase
    .from('leads')
    .select('canonical_intelligence, sender_profile_id')
    .eq('id', leadId)
    .eq('organization_id', orgId)
    .single()

  if (!lead) return []

  // Get all active profiles for this org
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, identity_name, skills, technologies, expertise, industries, allowed_first_person_claims')
    .eq('organization_id', orgId)
    .eq('status', 'active')

  if (!profiles) return []

  // Extract capabilities from lead's V3 intelligence
  const v3Packet = (lead.canonical_intelligence as Record<string, unknown>)?.v3DecisionPacket as Record<string, unknown> | undefined
  const capabilities = extractCapabilitiesFromV3(v3Packet)

  if (capabilities.length === 0) return []

  // Rank profiles
  const { rankProfilesForOpportunity } = await import('@/lib/profile-match')
  const ranked = rankProfilesForOpportunity(
    { opportunityCapabilities: capabilities, opportunityIndustries: [], opportunityType: 'lead', leadId },
    profiles.map(p => ({
      profileId: p.id,
      identityName: p.identity_name,
      skills: p.skills || [],
      technologies: p.technologies || [],
      expertise: p.expertise || [],
      industries: p.industries || [],
      allowedClaims: p.allowed_first_person_claims || [],
    })),
  )

  return ranked
    .filter(r => r.profileId !== currentProfileId && r.matchScore > 10)
    .slice(0, 5)
    .map(r => ({
      profileId: r.profileId,
      identityName: r.identityName,
      matchScore: r.matchScore,
      reason: r.reason,
    }))
}

function extractCapabilitiesFromV3(v3Packet: Record<string, unknown> | undefined): string[] {
  if (!v3Packet) return []
  const episodes = (v3Packet.episodes as Array<Record<string, unknown>>) || []
  const caps: Set<string> = new Set()
  for (const ep of episodes) {
    const reqCaps = ep.requestedCapabilities as string[] || []
    reqCaps.forEach(c => caps.add(c))
  }
  return [...caps]
}
