import type { EmailStrategy, Lead } from '@/lib/domain/types'

const BANNED = [
  'Exciting Opportunity!!!',
  'Quick Question',
  "Let's Collaborate",
  'Unlock Your Potential',
  'Revolutionize Your Business',
]

function clean(words: string): string {
  return words.replace(/[!]+/g, '').replace(/\s+/g, ' ').trim()
}

function scoreSubject(subject: string): number {
  const words = subject.split(/\s+/).filter(Boolean)
  let score = 0
  if (words.length >= 2 && words.length <= 7) score += 3
  if (subject.includes('?')) score += 1
  if (/hiring|support|capacity|delivery|partner|role|project|help/i.test(subject)) score += 2
  if (/quick question|exciting|unlock|revolutionize/i.test(subject.toLowerCase())) score -= 4
  return score
}

export function generateSubjectCandidates(input: {
  lead: Lead
  strategy: EmailStrategy
}): string[] {
  const { lead, strategy } = input
  const contact = lead.contactName?.split(' ')[0] ?? lead.company
  const company = lead.company
  const evidence = strategy.strongestEvidence ?? strategy.allowedEvidence[0] ?? 'support'

  const candidates = [
    `${company} ${strategy.emailGoal === 'GET_REPLY' ? 'capacity' : 'support'}`,
    `${contact}, ${strategy.primaryUncertainty ?? 'quick thought'}`,
    `${company} + ${evidence}`,
    `${company} project support?`,
    `${contact} - useful follow-up`,
  ]
    .map(clean)
    .filter((s) => s.length >= 4)
    .filter((s) => !BANNED.includes(s))

  const uniq = [...new Set(candidates)]
  return uniq
    .sort((a, b) => scoreSubject(b) - scoreSubject(a))
    .slice(0, 5)
}

export function selectPrimarySubject(candidates: string[]): string {
  return candidates[0] ?? 'Relevant note'
}
