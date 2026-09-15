import type { InboundInput, InboundIntelligence, Profile, ProofItem } from '@/lib/domain/types'
import { scanForSecrets } from '@/lib/ai/secrets'

export interface RawInboundAnalysis {
  wants: string
  intent: string
  fit_score: number
  fit_relevance: string
  opportunity_quality: 'high' | 'medium' | 'low'
  recommended_profile_index: number
  identity_fit_reason: string
  matching_skills: string[]
  strongest_proof_indexes: number[]
  missing_info: string[]
  recommended_action: string
  can_generate_resume: boolean
  extracted_company: string | null
  extracted_contact: string | null
  extracted_title: string | null
  extracted_url: string | null
}

export function buildInboundSystemPrompt(
  profiles: Profile[],
  proofItems: ProofItem[],
): string {
  const profileSection = profiles.map((p, i) => ({
    index: i,
    id: p.id,
    platform: p.platform,
    label: p.label,
    headline: p.headline,
    profileUrl: p.profileUrl,
  }))

  const proofSection = proofItems.map((p, i) => ({
    index: i,
    id: p.id,
    profileId: p.profileId,
    projectSummary: p.projectSummary,
    reviewQuote: p.reviewQuote ? p.reviewQuote.slice(0, 200) : null,
    tags: p.tags,
  }))

  return `You are Relay's inbound intelligence engine. A potential client has reached out to your team. Analyze their request and match it to the best Revenue Identity (profile) and relevant proof.

CRITICAL RULES:
- NEVER write outreach or pitches. You are ANALYZING, not responding.
- If a direct question is asked, note it in "wants" — the reply must answer it.
- fit_score must be honest: score based on actual capability match, not wishful thinking.
- recommended_profile_index must be the index of the profile whose capabilities best match the client's needs, or -1 if no profile is a good fit.
- strongest_proof_indexes must only include proof that BELONGS to the recommended profile (match by profileId).
- NEVER recommend proof from one profile while selecting a different profile.
- can_generate_resume should be true only if the client explicitly asks for a resume/CV or the context strongly suggests one would help.

Your team's profiles:
${JSON.stringify(profileSection, null, 2)}

Your team's proof items:
${JSON.stringify(proofSection, null, 2)}`
}

export function buildInboundUserPrompt(input: InboundInput): string {
  const parts: string[] = []

  parts.push(`Source: ${input.source}`)
  parts.push(`\nClient's message:\n"""`)
  parts.push(input.message)
  parts.push(`"""`)

  if (input.company) parts.push(`\nCompany: ${input.company}`)
  if (input.contactName) parts.push(`\nContact name: ${input.contactName}`)
  if (input.contactTitle) parts.push(`\nContact title: ${input.contactTitle}`)
  if (input.url) parts.push(`\nURL: ${input.url}`)
  if (input.profileInfo) parts.push(`\nProfile info:\n${input.profileInfo}`)
  if (input.jobInfo) parts.push(`\nJob info:\n${input.jobInfo}`)
  if (input.context) parts.push(`\nAdditional context:\n${input.context}`)

  return parts.join('')
}

export function validateInboundInput(input: InboundInput): { ok: boolean; error?: string } {
  if (!input.message || !input.message.trim()) {
    return { ok: false, error: 'Message is required.' }
  }

  const secretScan = scanForSecrets(input.message)
  if (secretScan.blocked) {
    return { ok: false, error: 'Message appears to contain sensitive credentials. Remove them before analysis.' }
  }

  if (!['linkedin', 'upwork', 'email', 'referral', 'other'].includes(input.source)) {
    return { ok: false, error: 'Invalid source.' }
  }

  return { ok: true }
}

export function mapRawToIntelligence(
  raw: RawInboundAnalysis,
  profiles: Profile[],
  proofItems: ProofItem[],
): InboundIntelligence {
  const recommendedProfile =
    raw.recommended_profile_index >= 0 && raw.recommended_profile_index < profiles.length
      ? profiles[raw.recommended_profile_index]
      : null

  const profileId = recommendedProfile?.id
  const strongestProof = raw.strongest_proof_indexes
    .filter((i) => i >= 0 && i < proofItems.length)
    .map((i) => proofItems[i])
    .filter((p) => !profileId || p.profileId === profileId)
    .slice(0, 3)

  return {
    wants: raw.wants,
    intent: raw.intent,
    fitScore: Math.max(0, Math.min(100, raw.fit_score)),
    fitRelevance: raw.fit_relevance,
    opportunityQuality: raw.opportunity_quality,
    recommendedIdentity: recommendedProfile,
    identityFitReason: raw.identity_fit_reason,
    matchingSkills: raw.matching_skills,
    strongestProof,
    missingInfo: raw.missing_info,
    recommendedAction: raw.recommended_action,
    canGenerateResume: raw.can_generate_resume,
  }
}
