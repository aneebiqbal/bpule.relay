/**
 * BUG-006 / BUG-015 / BUG-016 — canonical identity and location extraction.
 *
 * These are the named regression fixtures from the open bug report. They run
 * through the same canonical boundary the Prospect, Inbound and Upwork routes
 * use, so a fix cannot live on one surface only.
 */
import { describe, expect, it } from 'vitest'
import { buildMinimalV2Canonical } from '@/lib/intelligence-v3/bridge'
import { extractStatedLocation } from '@/lib/intelligence-v2/extraction-pipeline'
import {
  normalizeExternalInput,
  countryFromLocation,
} from '@/lib/intelligence-v3/normalize-external-input'
import { normalizeProspectPaste } from '@/lib/prospect/paste-normalize'
import { looksLikePlace, mapLocationToRegion } from '@/lib/leads/targeting-pure'

describe('BUG006_LOCATION_EXTRACTION', () => {
  it.each([
    ['London, United Kingdom', 'UK'],
    ['Manchester, England, United Kingdom', 'UK'],
    ['Austin, Texas, United States', 'US'],
    ['Bellevue, Washington, United States', 'US'],
    ['Lahore, Punjab, Pakistan', 'outside_core'],
    ['Dubai, United Arab Emirates', 'UAE'],
    ['New York, NY, United States', 'US'],
    ['Berlin, Germany', 'EU'],
    ['München, Deutschland', 'EU'],
  ])('header location %s survives with region %s', (line, region) => {
    const raw = `Alex Kim\nCTO at Fieldnote\n${line}\nAbout\nBuilding tools for teams.`
    expect(extractStatedLocation(raw)?.value).toBe(line)
    expect(mapLocationToRegion(line)).toBe(region)
  })

  it('labeled location survives and derives the country', () => {
    const fields = normalizeExternalInput('Name: Alex Kim\nLocation: Austin, Texas, United States').structuredFields
    expect(fields.location).toBe('Austin, Texas, United States')
    expect(fields.country).toBe('United States')
  })

  it('"Remote" is a location word but invents no country', () => {
    expect(looksLikePlace('Remote')).toBe(false)
    expect(countryFromLocation('Remote')).toBeNull()
    const got = extractStatedLocation('Alex Kim\nCTO at Fieldnote\nLocation: Remote\nWe are hiring.')
    expect(got?.value).toBe('Remote')
    expect(mapLocationToRegion(got?.value)).toBe('unknown')
  })

  it('a single named city is a place; a missing location stays unknown', () => {
    expect(looksLikePlace('London')).toBe(true)
    expect(extractStatedLocation('Alex Kim\nCTO at Fieldnote\nLondon\nAbout\nBuilding.')?.value).toBe('London')
    expect(extractStatedLocation('Alex Kim\nCTO at Fieldnote\nAbout\nBuilding tools.')).toBeNull()
  })
})

describe('BUG015_LOWERCASE_SURNAME', () => {
  it.each([
    ['Hello, my name is Usama jamil, and I\'m CTO at Devsinc.', 'Usama jamil'],
    ['Hello, my name is Usama Jamil, and I\'m CTO at Devsinc.', 'Usama Jamil'],
  ])('%s', (raw, name) => {
    const f = normalizeExternalInput(raw).structuredFields
    expect(f.name).toBe(name)
    expect(f.title).toBe('CTO')
    expect(f.company).toBe('Devsinc')
  })

  it.each([
    ['van der Meer', 'Jan van der Meer'],
    ['de la Cruz', 'Ana de la Cruz'],
    ["O'Connor", "Sean O'Connor"],
    ['Smith-Jones', 'Alex Smith-Jones'],
  ])('protects %s', (_label, name) => {
    const raw = `Hello, my name is ${name}, and I'm CTO at Devsinc.`
    expect(normalizeExternalInput(raw).structuredFields.name).toBe(name)
  })
})

describe('BUG016_MARKDOWN_NAME_CURRENT_EMPLOYER', () => {
  it.each([
    '### Oliver Haines',
    '**Oliver Haines**',
    'Oliver Haines – CertRP',
    '### **Oliver Haines – CertRP**',
  ])('reads the name from %s', (heading) => {
    const raw = `${heading}\nSenior Recruiter at Nexora Talent Solutions\nManchester, England, United Kingdom\n\nAbout\nRecruiting.`
    const canonical = buildMinimalV2Canonical(normalizeProspectPaste(raw))
    expect(canonical.intelligence.person.fullName).toBe('Oliver Haines')
    expect(canonical.intelligence.company.name).toBe('Nexora Talent Solutions')
    expect(canonical.intelligence.person.location).toBe('Manchester, England, United Kingdom')
  })

  it('chooses the current employer, not a previous one', () => {
    const raw = `**James Whitfield**
Principal Recruiter | Nexora Talent Solutions
Austin, Texas, United States

About
Recruiting for fintech.

Experience
Nexora Talent Solutions
Principal Recruiter
2021 - Present

Robert Walters
Recruiter
2015 - 2021`
    const canonical = buildMinimalV2Canonical(normalizeProspectPaste(raw))
    expect(canonical.intelligence.person.fullName).toBe('James Whitfield')
    expect(canonical.intelligence.company.name).toBe('Nexora Talent Solutions')
    expect(canonical.intelligence.company.name).not.toBe('Robert Walters')
  })

  it('keeps a company whose name contains a role word', () => {
    const raw = `**Dana Fox**\nPartner at Talent Bridge Solutions\nBerlin, Germany\n\nAbout\nHiring.`
    expect(buildMinimalV2Canonical(normalizeProspectPaste(raw)).intelligence.company.name).toBe('Talent Bridge Solutions')
  })
})
