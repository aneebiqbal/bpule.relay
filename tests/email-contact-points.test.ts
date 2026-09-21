import { describe, expect, it } from 'vitest'
import {
  emailDomain,
  inferPatternEmail,
  isBusinessEmail,
  isValidEmail,
  toVerificationStatus,
} from '@/lib/email/contact-points'

describe('email contact point helpers', () => {
  it('validates basic email format and domain extraction', () => {
    expect(isValidEmail('person@company.com')).toBe(true)
    expect(isValidEmail('bad@@company.com')).toBe(false)
    expect(emailDomain('person@company.com')).toBe('company.com')
  })

  it('detects business vs free mailbox domains', () => {
    expect(isBusinessEmail('person@company.com')).toBe(true)
    expect(isBusinessEmail('person@gmail.com')).toBe(false)
  })

  it('downgrades inferred addresses to unverified unless explicitly bad', () => {
    expect(toVerificationStatus({ source: 'INFERRED_PATTERN', providerStatus: 'VERIFIED' })).toBe('UNVERIFIED')
    expect(toVerificationStatus({ source: 'INFERRED_PATTERN', providerStatus: 'INVALID' })).toBe('INVALID')
    expect(toVerificationStatus({ source: 'USER_PROVIDED', providerStatus: 'LIKELY_VALID' })).toBe('LIKELY_VALID')
  })

  it('infers first.last format when enough identity info exists', () => {
    expect(inferPatternEmail('Jane Doe', 'acme.io')).toBe('jane.doe@acme.io')
    expect(inferPatternEmail('Single', 'acme.io')).toBeNull()
    expect(inferPatternEmail(null, 'acme.io')).toBeNull()
  })
})
