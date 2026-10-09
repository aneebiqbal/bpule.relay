import type { ExtractedLead, Profile, MatchedProof } from '@/lib/domain/types'

/**
 * Connection Note Strategy
 *
 * Before writing a connection note, determine:
 * - why connect?
 * - what is genuinely relevant?
 * - strongest safe signal
 * - sender/prospect overlap
 * - what should NOT be mentioned?
 * - desired tone
 *
 * The user never sees this internal strategy — it shapes the note.
 */

export interface ConnectionNoteStrategy {
  whyConnect: string
  relevantObservation: string
  strongestSafeSignal: string
  senderOverlap: string
  forbidden: string[]
  tone: string
  candidateAngles: ConnectionAngle[]
}

export interface ConnectionAngle {
  label: string
  approach: string
  systemDirective: string
}

const SURVEILLANCE_SIGNALS = [
  'raised', 'funding', 'series', 'seed round', 'budget',
  'recently closed', 'recently announced',
]

export function buildConnectionNoteStrategy(
  extracted: ExtractedLead,
  profile: Profile | null,
  matchedProof: MatchedProof[],
): ConnectionNoteStrategy {
  const forbidden: string[] = []
  const combined = `${extracted.signalEvidence} ${extracted.aboutSummary ?? ''} ${extracted.verbatimQuote ?? ''}`

  let whyConnect = 'Professional relevance in a shared domain.'
  const title = extracted.titleRaw ?? extracted.title ?? ''

  if (/\b(ceo|cto|founder|co[- ]?founder)\b/i.test(title)) {
    whyConnect = 'Senior leader at a company that may benefit from relevant engineering experience.'
  } else if (/\b(vp|head|director|principal|staff)\b/i.test(title)) {
    whyConnect = 'Senior technical leader with influence over delivery decisions.'
  } else if (/\b(engineer|developer|architect)\b/i.test(title)) {
    whyConnect = 'Technical peer with relevant domain expertise.'
  }

  let relevantObservation = ''
  if (extracted.verbatimQuote && extracted.verbatimQuote.length > 12) {
    relevantObservation = `Their words: "${extracted.verbatimQuote.slice(0, 100)}"`
  } else if (extracted.signalEvidence && extracted.signalEvidence.length > 12) {
    relevantObservation = extracted.signalEvidence.slice(0, 120)
  } else if (extracted.aboutSummary) {
    relevantObservation = extracted.aboutSummary.slice(0, 120)
  }

  let strongestSafeSignal = ''
  if (/\bhiring\b/i.test(combined)) {
    strongestSafeSignal = 'They are currently hiring.'
  } else if (/\b(launching|building|scaling|migrating)\b/i.test(combined)) {
    strongestSafeSignal = 'They are actively building or scaling something.'
  } else if (/\b(looking for|seeking|need help)\b/i.test(combined)) {
    strongestSafeSignal = 'They are openly seeking external help.'
  }

  if (/\braised|funding|series|seed\b/i.test(combined)) {
    forbidden.push('Do NOT mention their funding or raise — this is surveillance.')
  }
  if (/\bbudget\b/i.test(combined)) {
    forbidden.push('Do NOT mention budget or spending capacity.')
  }
  if (!extracted.name) {
    forbidden.push('Do NOT guess or fabricate a name.')
  }

  let senderOverlap = ''
  if (profile && matchedProof.length > 0) {
    const topProof = matchedProof[0]
    senderOverlap = `${profile.label ?? 'The sender'} has verified experience in: ${topProof.safeClaim.slice(0, 80)}`
  } else if (profile) {
    senderOverlap = `${profile.label ?? 'The sender'} will connect as a fellow professional.`
  }

  let tone = 'warm, brief, professional'
  if (/\b(engineer|developer|cto|architect)\b/i.test(title)) {
    tone = 'peer-level, technical, no fluff'
  } else if (/\b(ceo|founder|president)\b/i.test(title)) {
    tone = 'respectful, concise, business-aware'
  }

  const candidateAngles = buildCandidateAngles(extracted, profile, matchedProof, forbidden)

  return {
    whyConnect,
    relevantObservation,
    strongestSafeSignal,
    senderOverlap,
    forbidden,
    tone,
    candidateAngles,
  }
}

function buildCandidateAngles(
  extracted: ExtractedLead,
  profile: Profile | null,
  matchedProof: MatchedProof[],
  forbidden: string[],
): ConnectionAngle[] {
  const angles: ConnectionAngle[] = []
  const title = extracted.titleRaw ?? extracted.title ?? ''

  // Shared rules for ALL angles — connection notes earn access, not discovery.
  const sharedRules = [
    'NO questions. NO curiosity language. NO "curious about", "how do you", "would love to learn".',
    'NO pitch. NO service description. NO "I can help", "we build", "we deliver".',
    'NO praise. NO "impressive", "great work", "caught my attention".',
    'Specific observation + genuine overlap + simple reason to connect only.',
    'Must sound natural if spoken aloud. Zero effort to respond to.',
  ].join(' ')

  // Angle A: Shared domain / genuine professional overlap
  angles.push({
    label: 'Shared domain',
    approach: 'One specific observation about their work or domain, then a natural reason to connect.',
    systemDirective: `${sharedRules} Lead with a genuine, specific observation about their domain or work. Then state a simple reason to connect. Sound like one professional in the same space reaching out to another.`,
  })

  // Angle B: Relevant proof / credibility (only if we have a match)
  if (profile && matchedProof.length > 0) {
    const topProof = matchedProof[0]
    angles.push({
      label: 'Relevant proof',
      approach: `Briefly reference ${profile.label}'s relevant experience without a pitch.`,
      systemDirective: `${sharedRules} Reference ONE specific relevant capability: "${topProof.safeClaim.slice(0, 80)}". Connect it to their work in one sentence. The proof is context, not a pitch.`,
    })
  }

  // Angle C: Specific observation (if we have a verbatim quote or specific evidence)
  if (extracted.verbatimQuote && extracted.verbatimQuote.length > 15) {
    angles.push({
      label: 'Specific observation',
      approach: 'React to something specific they said or did.',
      systemDirective: `${sharedRules} React to this specific thing: "${extracted.verbatimQuote.slice(0, 80)}". A genuine reaction, not a compliment. Show you actually read it.`,
    })
  }

  if (forbidden.length > 0) {
    for (const angle of angles) {
      angle.systemDirective += ` ABSOLUTELY DO NOT mention: ${forbidden.join('; ')}.`
    }
  }

  return angles.slice(0, 3)
}
