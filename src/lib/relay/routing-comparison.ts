/**
 * Routing v1 ↔ v2 comparison view (Phase / Day 4).
 *
 * Puts the production router (v1) and the semantic router (v2, shadow) side by
 * side for one opportunity, with the flags the admin QA center needs. v2 is
 * never promoted here — this is measurement and review only.
 */

import type { LeadDetail } from '@/lib/store/types'
import type { SenderProfile } from './sender-routing-engine'
import { routeLead, parsePacket } from './routing-context'
import { compareRouting } from '@/lib/scoring-v4/routing-compare'
import { buildOpportunityFeatures } from '@/lib/scoring-v4/opportunity-features'
import { buildSenderCapabilityProfile } from '@/lib/scoring-v4/sender-capability-profile'

export type RoutingFlag =
  | 'V1_V2_DISAGREE'
  | 'BEST_SENDER_INACCESSIBLE'
  | 'NO_VERIFIED_PROOF'
  | 'CURRENT_SENDER_UNKNOWN'
  | 'PLATFORM_MISMATCH'

export interface RoutingComparisonView {
  leadId: string
  company: string
  currentSenderId: string | null
  currentSenderName: string | null
  v1: { senderId: string | null; name: string | null; match: number | null }
  v2: { senderId: string | null; name: string | null; match: number | null }
  agree: boolean
  flags: RoutingFlag[]
  proofUsed: boolean
  platformMatch: boolean
  scoreGap: number | null
  routingVersion: string | null
  compareVersion: string
}

export function buildRoutingComparison(input: {
  lead: Pick<LeadDetail, 'id' | 'company' | 'senderProfileId' | 'canonicalIntelligence'>
  senders: SenderProfile[]
  platform?: string | null
}): RoutingComparisonView | null {
  const packet = parsePacket(input.lead.canonicalIntelligence)
  if (!packet) return null

  const platform = input.platform ?? null
  const routing = routeLead(
    {
      company: input.lead.company,
      contactName: null,
      contactTitle: null,
      rawInput: null,
      senderProfileId: input.lead.senderProfileId ?? null,
      canonicalIntelligence: input.lead.canonicalIntelligence,
    },
    packet,
    input.senders,
    platform,
  )
  const v1Best = routing.rankings[0] ?? null
  const v1Sender = input.lead.senderProfileId
    ? (routing.rankings.find((r) => r.senderId === input.lead.senderProfileId) ?? null)
    : null

  const features = buildOpportunityFeatures({
    facts: packet.sourceFacts ?? ({} as never),
    intent: packet.buyerIntent ?? ({} as never),
    decision: packet.decision ?? null,
    platform: (platform as never) ?? undefined,
    resolved: (packet.resolved ?? null) as never,
  })
  const v2Senders = input.senders.map((s) => buildSenderCapabilityProfile(s))
  const cmp = compareRouting({
    features,
    senders: v2Senders,
    currentSenderId: input.lead.senderProfileId ?? null,
    v1: { senderId: v1Best?.senderId ?? null, score: v1Best?.profileMatch ?? null },
  })

  const v2Best = cmp.v2.rankings[0] ?? null
  const flags: RoutingFlag[] = []
  if (cmp.difference.senderChanged) flags.push('V1_V2_DISAGREE')
  if (!cmp.eligibility.accessible) flags.push('BEST_SENDER_INACCESSIBLE')
  if (cmp.proofUsed.strength !== 'VERIFIED') flags.push('NO_VERIFIED_PROOF')
  if (!input.lead.senderProfileId) flags.push('CURRENT_SENDER_UNKNOWN')
  if (platform && v2Best && !platformCompatible(v2Best.identityId, platform, input.senders)) flags.push('PLATFORM_MISMATCH')
  return {
    leadId: input.lead.id,
    company: input.lead.company,
    currentSenderId: input.lead.senderProfileId ?? null,
    currentSenderName: v1Sender?.name ?? null,
    v1: { senderId: v1Best?.senderId ?? null, name: v1Best?.name ?? null, match: v1Best?.profileMatch ?? null },
    v2: { senderId: v2Best?.identityId ?? null, name: v2Best?.name ?? null, match: v2Best?.match ?? null },
    agree: !cmp.difference.senderChanged,
    flags,
    proofUsed: cmp.proofUsed.strength !== 'NONE',
    platformMatch: platform ? platformCompatible(v2Best?.identityId ?? null, platform, input.senders) : true,
    scoreGap: cmp.difference.delta,
    routingVersion: routing.routingVersion,
    compareVersion: cmp.version,
  }
}

/** A sender is platform-compatible when its channel matches, or it has none recorded. */
export function platformCompatible(senderId: string | null | undefined, platform: string, senders: SenderProfile[]): boolean {
  if (!senderId) return true
  const sender = senders.find((s) => s.id === senderId)
  const senderPlatform = sender?.platform ?? null
  if (!senderPlatform) return true
  return senderPlatform === platform
}
