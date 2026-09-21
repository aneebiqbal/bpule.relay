import type { ClaimEvidenceType, EmailClaimIssue, EmailClaimSafetyResult } from '@/lib/domain/types'

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function overlapsAllowedEvidence(sentence: string, allowedEvidence: string[]): boolean {
  const lower = sentence.toLowerCase()
  return allowedEvidence.some((e) => {
    const tokens = e.toLowerCase().split(/\s+/).filter((t) => t.length >= 4)
    if (tokens.length === 0) return false
    return tokens.some((token) => lower.includes(token))
  })
}

function requiredEvidenceForSentence(sentence: string): ClaimEvidenceType[] {
  const lower = sentence.toLowerCase()
  if (/i\s+work|i\s+shipped|i\s+built|i\s+delivered|my experience|i can/i.test(lower)) {
    return ['VERIFIED_SENDER_FACT', 'VERIFIED_PROOF']
  }
  if (/you|your company|team|hiring|project|launch|roadmap/i.test(lower)) {
    return ['VERIFIED_LEAD_FACT', 'VERIFIED_OPPORTUNITY_FACT']
  }
  return ['USER_APPROVED_FACT']
}

export function validateEmailClaims(input: {
  body: string
  allowedEvidence: string[]
  thingsNotToClaim: string[]
}): EmailClaimSafetyResult {
  const { body, allowedEvidence, thingsNotToClaim } = input
  const issues: EmailClaimIssue[] = []
  const sentences = splitSentences(body)

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()

    const forbidden = thingsNotToClaim.find((claim) => claim && lower.includes(claim.toLowerCase()))
    if (forbidden) {
      issues.push({
        sentence,
        reason: `Mentions blocked claim: ${forbidden}`,
        requiredEvidence: requiredEvidenceForSentence(sentence),
      })
      continue
    }

    const hasFactualIntent = /\b(is|are|was|were|have|has|hiring|looking|built|delivered|worked)\b/i.test(sentence)
    if (hasFactualIntent && !overlapsAllowedEvidence(sentence, allowedEvidence)) {
      issues.push({
        sentence,
        reason: 'Factual sentence is not traceable to allowed evidence.',
        requiredEvidence: requiredEvidenceForSentence(sentence),
      })
    }
  }

  if (issues.length === 0) {
    return {
      safe: true,
      repaired: false,
      allowedEvidence,
      thingsNotToClaim,
      issues: [],
      repairedBody: null,
    }
  }

  const repairedBody = sentences
    .filter((sentence) => !issues.some((issue) => issue.sentence === sentence))
    .join(' ')
    .trim()

  const stillUnsafe = repairedBody.length === 0

  return {
    safe: !stillUnsafe,
    repaired: !stillUnsafe,
    allowedEvidence,
    thingsNotToClaim,
    issues,
    repairedBody: stillUnsafe ? null : repairedBody,
  }
}
