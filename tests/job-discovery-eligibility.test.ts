import { describe, expect, it } from 'vitest'
import {
  classifyRemoteEligibility,
  countryFromLocation,
  evaluateEligibility,
  type JobEligibilityInput,
} from '@/lib/job-discovery/eligibility'

function classify(description: string, overrides: Partial<JobEligibilityInput> = {}) {
  return classifyRemoteEligibility({
    title: 'Senior Backend Engineer',
    description,
    locationRaw: 'Remote',
    remote: true,
    ...overrides,
  })
}

describe('classifyRemoteEligibility', () => {
  it('treats explicit worldwide language as worldwide', () => {
    const result = classify('We are a fully distributed team. Work from anywhere in the world.')
    expect(result.classification).toBe('worldwide')
    expect(result.confidence).toBe('likely')
    expect(result.explanation).toMatch(/anywhere/i)
  })

  it('detects a hard US-only restriction', () => {
    const result = classify('Remote role. You must be located in the United States.')
    expect(result.classification).toBe('country_restricted')
    expect(result.countries).toContain('US')
    expect(result.confidence).toBe('confirmed')
    expect(result.evidence.some((e) => /united states/i.test(e.text))).toBe(true)
  })

  it('does not let a benefits-section "remote anywhere" mask a real country boundary', () => {
    const result = classify(
      [
        'Benefits: remote anywhere, flexible hours, and a learning budget.',
        'Location: This position is US only. You must be authorized to work in the United States.',
      ].join('\n'),
    )
    expect(result.classification).toBe('country_restricted')
    expect(result.countries).toContain('US')
    // The actual restriction is in the evidence, not just the marketing line.
    expect(result.evidence.some((e) => /us only/i.test(e.text))).toBe(true)
    expect(result.explanation).toMatch(/restricts work to US/)
  })

  it('detects a region restriction', () => {
    const result = classify('Remote within Europe only. Candidates must be based in the EU.')
    expect(result.classification).toBe('region_restricted')
    expect(result.regions).toEqual(expect.arrayContaining(['EU']))
  })

  it('detects a timezone restriction', () => {
    const result = classify('Remote, but you must work US Eastern time hours with at least 4 hours overlap.')
    expect(result.classification).toBe('timezone_restricted')
    expect(result.timezones.length).toBeGreaterThan(0)
  })

  it('detects residency / work-authorization requirements', () => {
    const result = classify('Remote role. Visa sponsorship is not available; you must have the right to work in Germany.')
    expect(result.classification).toBe('country_restricted')
    expect(result.countries).toContain('DE')
    expect(result.workAuthorizationRequired).toBe(true)
    expect(result.residencyRequired).toBe(true)

    const noCountry = classify('Remote role. Visa sponsorship is not available; you must have the right to work.')
    expect(noCountry.classification).toBe('residency_required')
    expect(noCountry.workAuthorizationRequired).toBe(true)
  })

  it('distinguishes contractor-friendly from employee-only', () => {
    const contract = classify('This is a 1099 contract role; independent contractors are welcome.')
    expect(contract.classification).toBe('contractor_allowed')
    expect(contract.contractorAllowed).toBe(true)

    const employee = classify('Full-time employee role. W-2 only; no contractors.')
    expect(employee.classification).toBe('employee_only')
    expect(employee.employeeOnly).toBe(true)
    expect(employee.contractorAllowed).toBe(false)
  })

  it('does not claim worldwide merely because the posting says remote', () => {
    const result = classify('We are hiring a remote backend engineer to join our team.')
    expect(result.classification).toBe('unknown')
    expect(result.remote).toBe(true)
    expect(result.confidence).toBe('unknown')
  })

  it('treats a single-country location as a likely boundary when no worldwide statement exists', () => {
    const result = classify('Remote within the country. Competitive salary and benefits.', {
      locationRaw: 'Berlin, Germany',
    })
    expect(result.classification).toBe('country_restricted')
    expect(result.countries).toContain('DE')
    expect(result.confidence).toBe('likely')
  })

  it('does not treat the pronoun "join us" as a US restriction', () => {
    const result = classify('We are a distributed team. Join us to build developer tools. Remote role.')
    expect(result.classification).toBe('unknown')
    expect(result.countries).not.toContain('US')
  })

  it('detects an explicit US-based boundary', () => {
    const result = classify('This is a US-based role. You must be located in the US.')
    expect(result.classification).toBe('country_restricted')
    expect(result.countries).toContain('US')
  })

  it('classifies Pakistan eligibility from explicit and regional evidence', () => {
    const explicit = classify('Remote role open to Pakistan-based engineers.')
    expect(explicit.pakistan.eligible).toBe(true)
    expect(explicit.pakistan.classification).toBe('explicit_pakistan')
    expect(explicit.pakistan.confidence).toBe('confirmed')

    const worldwide = classify('Work from anywhere in the world.')
    expect(worldwide.pakistan.eligible).toBe(true)
    expect(worldwide.pakistan.classification).toBe('worldwide')

    const usOnly = classify('US only; must be authorized to work in the United States.')
    expect(usOnly.pakistan.eligible).toBe(false)
    expect(usOnly.pakistan.classification).toBe('country_restricted')
    expect(usOnly.pakistan.confidence).toBe('confirmed')

    const europe = classify('Remote within Europe only.')
    expect(europe.pakistan.eligible).toBe(false)
    expect(europe.pakistan.classification).toBe('region_restricted')

    const apac = classify('Remote across APAC.')
    expect(apac.pakistan.eligible).toBe(true)
    expect(apac.pakistan.classification).toBe('apac')
    expect(apac.pakistan.confidence).toBe('likely')

    const latam = classify('Remote within Latin America only.')
    expect(latam.pakistan.eligible).toBe(false)
    expect(latam.pakistan.classification).toBe('region_restricted')

    const mixed = classify('Remote across APAC and North America.')
    expect(mixed.pakistan.eligible).toBeNull()
    expect(mixed.pakistan.classification).toBe('region_restricted')
    expect(mixed.pakistan.confidence).toBe('unknown')

    // "Worldwide" marketing boilerplate must not override a named boundary.
    const boilerplate = classify('We are a worldwide company. This role is based in Singapore.', {
      locationRaw: 'Singapore',
    })
    expect(boilerplate.pakistan.eligible).toBe(false)
    expect(boilerplate.pakistan.classification).toBe('country_restricted')

    // A timezone boundary cannot be mapped to Pakistan without guessing.
    const timezone = classify('Remote, but you must work US Eastern time hours.')
    expect(timezone.pakistan.eligible).toBeNull()
    expect(timezone.pakistan.classification).toBe('timezone_restricted')

    const unknown = classify('Remote backend role.')
    expect(unknown.pakistan.eligible).toBeNull()
    expect(unknown.pakistan.classification).toBe('unknown')
  })

  it('uses Pakistan eligibility in the seeker verdict', () => {
    const usOnly = classify('US only; must be located in the United States.')
    const verdict = evaluateEligibility(usOnly, { country: 'PK' })
    expect(verdict.eligible).toBe(false)
    expect(verdict.confidence).toBe('confirmed')

    const worldwide = classify('Work from anywhere in the world.')
    expect(evaluateEligibility(worldwide, { country: 'PK' }).eligible).toBe(true)
  })

  it('extracts a country from a location string', () => {
    expect(countryFromLocation('Berlin, Germany')).toBe('DE')
    expect(countryFromLocation('Remote')).toBeNull()
    expect(countryFromLocation('New York, US')).toBe('US')
  })
})

describe('evaluateEligibility', () => {
  it('confirms a worldwide role for a known location', () => {
    const eligibility = classify('Work from anywhere in the world.')
    const verdict = evaluateEligibility(eligibility, { country: 'PK', timezone: 'UTC+5' })
    expect(verdict.eligible).toBe(true)
    expect(verdict.confidence).toBe('confirmed')
  })

  it('rejects a confidently ineligible country mismatch', () => {
    const eligibility = classify('Remote US only; must be authorized to work in the United States.')
    const verdict = evaluateEligibility(eligibility, { country: 'PK', timezone: 'UTC+5' })
    expect(verdict.eligible).toBe(false)
    expect(verdict.confidence).toBe('confirmed')
    expect(verdict.reasons.join(' ')).toMatch(/restricts work to US/)
  })

  it('never treats unknown work authorization as authorized', () => {
    const eligibility = classify('You must be authorized to work in Germany.')
    const verdict = evaluateEligibility(eligibility, { country: 'DE', workAuthorization: 'unknown' })
    expect(verdict.eligible).toBe(false)
    expect(verdict.confidence).toBe('unknown')
    expect(verdict.reasons.join(' ')).toMatch(/not recorded/i)
  })

  it('flags a timezone mismatch as likely ineligible, not confirmed', () => {
    const eligibility = classify('Must work US Pacific time hours.')
    const verdict = evaluateEligibility(eligibility, { country: 'PK', timezone: 'UTC+5' })
    expect(verdict.eligible).toBe(false)
    expect(verdict.confidence).toBe('likely')
  })

  it('keeps an unstated geographic policy as unknown rather than eligible', () => {
    const eligibility = classify('Remote backend role.')
    const verdict = evaluateEligibility(eligibility, { country: 'PK' })
    expect(verdict.eligible).toBe(false)
    expect(verdict.confidence).toBe('unknown')
  })
})
