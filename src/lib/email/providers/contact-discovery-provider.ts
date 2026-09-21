export interface ContactDiscoveryPersonResult {
  fullName: string | null
  linkedinUrl: string | null
  website: string | null
  company: string | null
  role: string | null
  confidence: number
  sources: Array<{ url: string | null; sourceType: string; note: string }>
}

export interface ContactDiscoveryCompanyResult {
  name: string | null
  website: string | null
  domain: string | null
  services: string[]
  industry: string | null
  location: string | null
  confidence: number
  sources: Array<{ url: string | null; sourceType: string; note: string }>
}

export interface ContactDiscoveryEmailResult {
  email: string
  source: 'USER_PROVIDED' | 'PUBLIC_PROFILE' | 'COMPANY_WEBSITE' | 'PUBLIC_DIRECTORY' | 'CONNECTED_PROVIDER' | 'INBOUND' | 'INFERRED_PATTERN'
  sourceUrl: string | null
  confidence: number
  verificationStatus: 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN'
}

export interface ContactDiscoveryProvider {
  id: string
  name: string
  findPerson(input: {
    fullName?: string | null
    linkedinUrl?: string | null
    website?: string | null
    company?: string | null
    role?: string | null
  }): Promise<ContactDiscoveryPersonResult | null>
  findCompany(input: {
    company?: string | null
    website?: string | null
    domain?: string | null
    linkedinUrl?: string | null
  }): Promise<ContactDiscoveryCompanyResult | null>
  findEmails(input: {
    fullName?: string | null
    company?: string | null
    domain?: string | null
    linkedinUrl?: string | null
    website?: string | null
  }): Promise<ContactDiscoveryEmailResult[]>
  verifyEmail(input: {
    email: string
    companyDomain?: string | null
  }): Promise<{
    status: 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN'
    confidence: number
    method: string
  }>
}

export const noContactDiscoveryProvider: ContactDiscoveryProvider = {
  id: 'none',
  name: 'No provider configured',
  async findPerson() {
    return null
  },
  async findCompany() {
    return null
  },
  async findEmails() {
    return []
  },
  async verifyEmail() {
    return {
      status: 'UNKNOWN',
      confidence: 0,
      method: 'NO_PROVIDER',
    }
  },
}

export function getContactDiscoveryProvider(): ContactDiscoveryProvider {
  return noContactDiscoveryProvider
}
