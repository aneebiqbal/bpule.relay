/**
 * Deterministic sales-thesis derivation.
 *
 * The message engine must never invent a reason to talk. `deriveSalesThesis`
 * turns verified SourceFacts + OpportunityFeatures into the WHY behind a
 * message, marking every inferred item as a hypothesis and every unsupported
 * field as unknown. Facts are facts; everything else is labelled.
 */

import type { SourceFacts } from '@/lib/intelligence-v3/source-facts-model'
import type { LeadArchetype, SalesThesis, ThesisConfidence } from './sales-thesis'

export type Basis = 'FACT' | 'HYPOTHESIS' | 'UNKNOWN'

export interface DerivedSalesThesis extends SalesThesis {
  /** Which fields are fact vs hypothesis vs unknown. */
  basis: Record<'whyThisAccount' | 'likelyOpportunity' | 'whyUs' | 'whyThisSender' | 'bestEntryPoint', Basis>
}

export interface DeriveThesisInput {
  sourceFacts: SourceFacts
  buyerIntent?: { level: string | null; verifiedBuyerRequest: boolean; requestAgeDays: number | null } | null
  archetype?: LeadArchetype | null
  fit?: { level: string | null; capabilityOverlap: string[] } | null
  accountValue?: number | null
  senderProfile?: { displayName: string; capabilities: string[]; industries: string[] } | null
}

const UNKNOWN = 'Unverified'

function firstSentence(text: string | null | undefined, max = 140): string {
  if (!text) return ''
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function list(items: string[], max = 3): string {
  const clean = items.map((i) => i.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  return clean.slice(0, max).join(', ')
}

/** The canonical derivation. Pure: plain data in, plain thesis out. */
export function deriveSalesThesis(input: DeriveThesisInput): DerivedSalesThesis {
  const sf = input.sourceFacts
  const archetype = input.archetype ?? 'unknown_intent'

  const accountBits: string[] = []
  if (sf.currentCompany) accountBits.push(sf.currentCompany)
  if (sf.currentRole) accountBits.push(sf.currentRole)
  if (sf.founderOrBuilder) accountBits.push('founder/operator')
  if (sf.currentProductActivity) accountBits.push('active product activity')
  else if (sf.recentPostAgeDays != null && sf.recentPostAgeDays > 60) accountBits.push('low recent activity')
  if (sf.currentIndustry) accountBits.push(`${sf.currentIndustry} space`)
  const whyThisAccount = accountBits.length > 0 ? accountBits.join(' · ') : 'Unknown account'
  const accountBasis: Basis = sf.currentCompany || sf.currentRole ? 'FACT' : 'UNKNOWN'

  // Likely opportunity: a verified buyer request is a FACT; anything else is a hypothesis.
  let likelyOpportunity = ''
  let opportunityBasis: Basis = 'UNKNOWN'
  if (input.buyerIntent?.verifiedBuyerRequest && sf.buyerRequest) {
    likelyOpportunity = `Direct request: ${firstSentence(sf.buyerRequest, 120)}`
    opportunityBasis = 'FACT'
  } else if (sf.externalNeed && sf.capabilityNeeds.length > 0) {
    likelyOpportunity = `Potential ${list(sf.capabilityNeeds, 2)} capacity pressure`
    opportunityBasis = 'HYPOTHESIS'
  } else if (sf.hiringUrgent) {
    likelyOpportunity = 'Potential hiring-driven delivery capacity need'
    opportunityBasis = 'HYPOTHESIS'
  } else if (sf.fundingEvidence) {
    likelyOpportunity = `Potential post-funding build pressure (${firstSentence(sf.fundingEvidence, 80)})`
    opportunityBasis = 'HYPOTHESIS'
  } else {
    likelyOpportunity = UNKNOWN
    opportunityBasis = 'UNKNOWN'
  }

  // Why us: capability overlap only, never a claim the source does not support.
  const overlap = input.fit?.capabilityOverlap ?? sf.capabilityNeeds
  const whyUs = overlap.length > 0
    ? `Capability overlap: ${list(overlap, 3)}`
    : 'No verified capability overlap yet'
  const usBasis: Basis = overlap.length > 0 ? 'FACT' : 'UNKNOWN'

  // Why this sender: only from the selected sender's verified capabilities.
  const sender = input.senderProfile
  const senderFit = sender?.capabilities.filter((c) => overlap.includes(c)) ?? []
  const whyThisSender = sender
    ? (senderFit.length > 0
      ? `${sender.displayName} covers ${list(senderFit, 2)}`
      : `${sender.displayName} is the assigned sender; no direct capability overlap yet`)
    : 'No sender selected'
  const senderBasis: Basis = sender ? (senderFit.length > 0 ? 'FACT' : 'HYPOTHESIS') : 'UNKNOWN'

  const bestEntryPoint = entryPointFor(archetype, sf, opportunityBasis)
  const entryBasis: Basis = opportunityBasis === 'FACT' ? 'FACT' : 'HYPOTHESIS'

  const missingEvidence: string[] = []
  if (!sf.currentCompany) missingEvidence.push('company')
  if (!sf.currentRole) missingEvidence.push('role')
  if (opportunityBasis === 'UNKNOWN') missingEvidence.push('a verified commercial need')
  if (input.buyerIntent?.requestAgeDays == null && !input.buyerIntent?.verifiedBuyerRequest) missingEvidence.push('request timing')
  if (!sf.budgetEvidence) missingEvidence.push('budget')
  if (input.fit?.level == null) missingEvidence.push('service fit')

  const risks: string[] = []
  if (sf.sellerActivity) risks.push('profile reads as a service provider / seller')
  if (sf.recruiterProfile) risks.push('recruiter profile — talent/channel angle only')
  if (sf.candidateSeeking) risks.push('candidate-seeking — no sales outreach')
  if (sf.terminalState) risks.push(`terminal source state: ${sf.terminalState.kind}`)
  if (sf.recentPostAgeDays != null && sf.recentPostAgeDays > 90) risks.push('stale source activity')
  if (sf.rejectedSignals.length > 0) risks.push(`${sf.rejectedSignals.length} source signals were rejected`)

  const confidence: ThesisConfidence =
    opportunityBasis === 'FACT' && usBasis === 'FACT' ? 'Potential'
      : opportunityBasis === 'UNKNOWN' ? 'Unverified'
        : 'Possible'

  return {
    whyThisAccount,
    likelyOpportunity,
    whyUs,
    whyThisSender,
    bestEntryPoint,
    missingEvidence,
    risks,
    confidence,
    basis: {
      whyThisAccount: accountBasis,
      likelyOpportunity: opportunityBasis,
      whyUs: usBasis,
      whyThisSender: senderBasis,
      bestEntryPoint: entryBasis,
    },
  }
}

function entryPointFor(archetype: LeadArchetype, sf: SourceFacts, opportunityBasis: Basis): string {
  switch (archetype) {
    case 'explicit_buyer':
      return opportunityBasis === 'FACT' ? 'Answer the stated need directly.' : 'Confirm the need, then answer it.'
    case 'technical_founder':
      return 'A technical capacity / product-velocity conversation.'
    case 'enterprise_leader':
      return 'Delivery risk, modernization or integration outcome.'
    case 'growth_builder':
      return 'Product velocity and capacity.'
    case 'service_provider':
      return sf.serviceOffering.length > 0 ? 'A possible complementary partnership angle.' : 'No pitch unless a real partnership exists.'
    case 'recruiter':
      return 'A talent/channel path only.'
    case 'candidate':
      return 'No sales outreach.'
    case 'closed':
      return 'No active thesis.'
    default:
      return 'A research-led, low-pressure question.'
  }
}
