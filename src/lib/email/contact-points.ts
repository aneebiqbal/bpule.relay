import type { ContactPoint, ContactPointVerificationStatus } from '@/lib/domain/types'

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
])

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length <= 254
}

export function emailDomain(email: string): string | null {
  if (!isValidEmail(email)) return null
  return normalizeEmail(email).split('@')[1] ?? null
}

export function isBusinessEmail(email: string): boolean {
  const domain = emailDomain(email)
  if (!domain) return false
  return !FREE_EMAIL_DOMAINS.has(domain)
}

export function isInferredEmailSource(source: string): boolean {
  return source === 'INFERRED_PATTERN'
}

/**
 * CAN_SEND_EMAIL — the single, shared definition of "this contact is
 * verified enough to send to." Used by BOTH prepareEmailDraft (to decide
 * whether a generated draft is READY or NEEDS_VERIFIED_CONTACT) and
 * sendPreparedEmail (the actual send-time enforcement gate) — see
 * src/lib/email/service.ts. There must be exactly one definition of this
 * so the two can never disagree.
 *
 * Deliberately conservative: only VERIFIED and LIKELY_VALID are send-
 * eligible. UNVERIFIED, UNKNOWN, INVALID, BOUNCED, and no contact at all
 * are NOT — including every INFERRED_PATTERN contact, which is never
 * automatically upgraded past UNVERIFIED (see toVerificationStatus below).
 * An inferred/guessed address must never become sendable merely because a
 * draft exists for it.
 */
export function isSendEligibleContact(contact: ContactPoint | null): boolean {
  if (!contact) return false
  return contact.verificationStatus === 'VERIFIED' || contact.verificationStatus === 'LIKELY_VALID'
}

export function toVerificationStatus(input: {
  source: string
  providerStatus: 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN'
}): ContactPointVerificationStatus {
  if (input.source === 'INFERRED_PATTERN') {
    return input.providerStatus === 'INVALID' || input.providerStatus === 'BOUNCED'
      ? input.providerStatus
      : 'UNVERIFIED'
  }
  return input.providerStatus
}

export function inferPatternEmail(fullName: string | null, companyDomain: string | null): string | null {
  if (!fullName || !companyDomain) return null
  const parts = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length < 2) return null
  const first = parts[0]
  const last = parts[parts.length - 1]
  if (!first || !last) return null
  return `${first}.${last}@${companyDomain.toLowerCase()}`
}
