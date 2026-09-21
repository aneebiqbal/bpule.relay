import type { EmailStrategy, Lead, RevenueIdentity } from '@/lib/domain/types'
import { generate } from '@/lib/ai/runtime'
import { generateSubjectCandidates, selectPrimarySubject } from '@/lib/email/subject'

interface GeneratedEmailCopy {
  subjectCandidates: string[]
  subject: string
  body: string
  followupPlan: string | null
}

const EMAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['body'],
  properties: {
    subjectCandidates: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 6,
    },
    body: { type: 'string' },
    followupPlan: { type: 'string' },
  },
} as const

function fallbackBody(input: {
  lead: Lead
  sender: RevenueIdentity
  strategy: EmailStrategy
}): string {
  const firstName = input.lead.contactName?.split(' ')[0] ?? 'there'
  const evidence = input.strategy.allowedEvidence[0] ?? input.strategy.strongestEvidence ?? `current priorities at ${input.lead.company}`
  return [
    `Hi ${firstName},`,
    '',
    `Saw ${evidence}. I work on similar delivery problems and can share a concrete example relevant to ${input.lead.company}.`,
    '',
    'Open to that?',
    '',
    input.sender.identityName,
  ].join('\n')
}

function sanitizeEmailBody(body: string): string {
  return body
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\bHope you\'re well\b/gi, 'Hi')
    .replace(/\bI came across your profile\b/gi, 'Saw your current focus')
    .trim()
}

export async function generateEmailCopy(input: {
  lead: Lead
  sender: RevenueIdentity
  strategy: EmailStrategy
  generationMode: 'standard' | 'premium'
}): Promise<GeneratedEmailCopy> {
  const seededSubjects = generateSubjectCandidates({ lead: input.lead, strategy: input.strategy })

  const system = [
    'You write concise outbound business emails for B2B prospecting.',
    'No em dash.',
    'No fake compliments, no fluff, no clickbait subject lines.',
    'Do not use these openings: Hope you are well, I came across your profile, Given your impressive background.',
    'Use only supplied allowed evidence. If evidence is weak, stay neutral and ask a lightweight question.',
    'First cold email should optimize for a reply, not a meeting ask.',
  ].join('\n')

  const user = [
    `Company: ${input.lead.company}`,
    `Contact: ${input.lead.contactName ?? 'Unknown'}${input.lead.contactTitle ? ` (${input.lead.contactTitle})` : ''}`,
    `Sender: ${input.sender.identityName}${input.sender.title ? ` (${input.sender.title})` : ''}`,
    `Email goal: ${input.strategy.emailGoal}`,
    `Why email: ${input.strategy.whyEmail}`,
    `Strongest evidence: ${input.strategy.strongestEvidence ?? 'n/a'}`,
    `Allowed evidence: ${input.strategy.allowedEvidence.join(' | ') || 'none'}`,
    `Do not claim: ${input.strategy.thingsNotToClaim.join(' | ') || 'none'}`,
    `Seed subjects: ${seededSubjects.join(' | ')}`,
    'Return JSON with subjectCandidates (2-6), body, and optional followupPlan.',
  ].join('\n')

  try {
    const task = input.generationMode === 'premium' ? 'DEEP_WRITING' : 'INTERACTIVE_WRITING'
    const generated = await generate<{
      subjectCandidates?: string[]
      body: string
      followupPlan?: string
    }>({
      task,
      system,
      user,
      schema: EMAIL_SCHEMA as unknown as Record<string, unknown>,
      feature: 'email_outreach',
      callSite: 'email/writer:generateEmailCopy',
    })

    const candidatePool = [
      ...(generated.data.subjectCandidates ?? []),
      ...seededSubjects,
    ]
      .map((s) => s.trim())
      .filter(Boolean)

    const subjectCandidates = [...new Set(candidatePool)].slice(0, 6)
    const subject = selectPrimarySubject(subjectCandidates)
    const body = sanitizeEmailBody(generated.data.body)

    return {
      subjectCandidates,
      subject,
      body,
      followupPlan: generated.data.followupPlan?.trim() || null,
    }
  } catch {
    const subjectCandidates = seededSubjects.length > 0 ? seededSubjects : ['Relevant note']
    return {
      subjectCandidates,
      subject: selectPrimarySubject(subjectCandidates),
      body: fallbackBody(input),
      followupPlan: null,
    }
  }
}
