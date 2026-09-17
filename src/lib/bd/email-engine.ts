/**
 * Email Discovery + Template Engine
 *
 * Provider abstraction for email discovery and email template generation.
 * Does NOT invent email addresses.
 */

export interface EmailDiscoveryProvider {
  id: string
  name: string
  findPersonEmail(input: EmailDiscoveryInput): Promise<EmailDiscoveryResult>
}

export interface EmailDiscoveryInput {
  name: string
  company: string | null
  domain: string | null
  linkedinUrl: string | null
}

export interface EmailDiscoveryResult {
  email: string | null
  confidence: 'verified' | 'likely' | 'unverified' | 'not_found'
  provider: string
  verificationStatus: 'valid' | 'invalid' | 'unknown'
  sourceName: string | null
  sourceCompany: string | null
}

export interface EmailTemplateInput {
  prospectName: string
  prospectCompany: string | null
  prospectRole: string | null
  senderName: string
  senderProfile: string | null
  relevantProof: string[]
  context: string
  strategy: string
}

export interface EmailTemplateResult {
  subject: string
  body: string
}

export const noopProvider: EmailDiscoveryProvider = {
  id: 'none',
  name: 'No provider configured',
  async findPersonEmail(): Promise<EmailDiscoveryResult> {
    return {
      email: null,
      confidence: 'not_found',
      provider: 'none',
      verificationStatus: 'unknown',
      sourceName: null,
      sourceCompany: null,
    }
  },
};

export function generateEmailTemplate(input: EmailTemplateInput): EmailTemplateResult {
  const { prospectName, prospectCompany, relevantProof, context, strategy } = input
  const subject = generateSubject(input)
  const body = generateEmailBody(input)
  return { subject, body }
}

function generateSubject(input: EmailTemplateInput): string {
  const { prospectCompany, prospectRole, strategy } = input

  if (strategy === 'technical_overlap' && prospectCompany) {
    return `${prospectCompany} + technical overlap`
  }
  if (strategy === 'relevant_proof' && prospectCompany) {
    return `Worked on something similar to ${prospectCompany}`
  }
  if (strategy === 'thoughtful_question') {
    return `Quick question about your stack`
  }
  if (strategy === 'role_connection' && prospectRole) {
    return `Fellow ${prospectRole.toLowerCase()} here`
  }
  if (prospectCompany) return `Regarding ${prospectCompany}`
  return 'Connecting'
}

function generateEmailBody(input: EmailTemplateInput): string {
  const { prospectName, prospectCompany, senderName, relevantProof, context, strategy } = input
  const firstName = prospectName?.split(' ')[0] ?? 'there'

  let opening: string
  switch (strategy) {
    case 'technical_overlap':
      opening = `Hey ${firstName}, I work with ${relevantProof[0] || 'similar technology'} and noticed you're doing similar work${prospectCompany ? ` at ${prospectCompany}` : ''}.`
      break
    case 'relevant_proof':
      opening = `Hey ${firstName}, I recently ${relevantProof[0] || 'delivered a similar project'} and came across your profile${prospectCompany ? ` at ${prospectCompany}` : ''}.`
      break
    case 'thoughtful_question':
      opening = `Hey ${firstName}, I'm curious about how you're handling ${context || 'your current infrastructure'} at ${prospectCompany || 'your company'}.`
      break
    case 'common_problem':
      opening = `Hey ${firstName}, dealing with ${context || 'similar scaling challenges'} is something I've worked through before.`
      break
    case 'product_observation':
      opening = `Been following ${prospectCompany || 'your product'} — ${context || 'impressive work'}.`
      break
    default:
      opening = `Hey ${firstName}, came across your profile${prospectCompany ? ` and your work at ${prospectCompany}` : ''}.`
  }

  const proof = relevantProof.length > 0 ? `I've ${relevantProof[0]}${relevantProof.length > 1 ? ` and ${relevantProof[1]}` : ''}.` : ''
  const cta = 'Worth a brief conversation?'
  const signOff = `Best,\n${senderName}`

  return [greeting, '', opening, proof, '', cta, '', signOff]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')

  function greeting(): string { return `Hey ${firstName},` }
}

export function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email) && email.length <= 254
}

export function extractDomain(input: string | null): string | null {
  if (!input) return null
  try {
    const url = input.startsWith('http') ? input : `https://${input}`
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    const cleaned = input.toLowerCase().replace(/[^a-z0-9.-]/g, '')
    if (cleaned.includes('.')) return cleaned
    return null
  }
}
