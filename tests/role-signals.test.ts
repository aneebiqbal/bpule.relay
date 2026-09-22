import { describe, expect, it } from 'vitest'
import { isClinicianProfile, isRecruiterTitle } from '@/lib/intelligence-v2/role-signals'

/**
 * Regression test for a false-positive bug found during the Relay hardening
 * sprint (Phase 3 determinism investigation): `constrainNonBuyerPassA()` in
 * extraction-pipeline.ts calls `isClinicianProfile(title, company, industory
 * + rawText)`, feeding the ENTIRE raw source text into a classifier whose
 * regex (CLINICIAN_TITLE) included bare 2-letter credential abbreviations
 * like `\bdo\b` and `\brn\b`. Those collide with ordinary English words —
 * any job posting or profile containing the word "do" ("What you'll do",
 * "it is flexible" -> no, but e.g. "things to do") as a normal verb would
 * false-positive as a clinician profile and have its opportunity signals
 * silently stripped to the (much smaller) clinician-allowed set, zeroing
 * out real hiring/funding/explicit_ask signals with no error or warning.
 *
 * This was the actual root cause behind two failing golden-corpus scoring
 * cases (intelligence-v2-benchmark.test.ts): "Founding Engineer — Series A
 * SaaS" scored 42 instead of >=45 because "What you'll do:" matched \bdo\b.
 */
describe('isClinicianProfile — must not false-positive on ordinary English text', () => {
  it('does not flag a software job posting containing the common word "do"', () => {
    const jobPostingText = `Founding Engineer (Remote, Worldwide)

B2B SaaS for logistics companies. Just raised $8M Seed.

What you'll do:
- Build the product from scratch with our CTO
- Make key architecture decisions`

    // Simulates how constrainNonBuyerPassA calls this: title + company + (industry + rawText)
    expect(isClinicianProfile('Founding Engineer', null, `${''} ${jobPostingText}`)).toBe(false)
  })

  it('does not flag text mentioning "RN" as part of an unrelated word or code', () => {
    const text = 'We use a modern stack. Learning curve is steep but the docs are great.'
    expect(isClinicianProfile(null, null, text)).toBe(false)
  })

  it('still correctly identifies a real clinician by explicit credential words in the title', () => {
    expect(isClinicianProfile('PMHNP-BC | Founder of Clarity Psychiatry', null, null)).toBe(true)
    expect(isClinicianProfile('Registered Nurse', null, null)).toBe(true)
    expect(isClinicianProfile('Licensed Therapist', null, null)).toBe(true)
    expect(isClinicianProfile(null, null, 'Family medicine clinic serving the Portland area')).toBe(true)
  })

  it('still recognizes conventional "Name, MD" / "Dr. Name, MD" credential formatting', () => {
    expect(isClinicianProfile('Jane Smith, MD', null, null)).toBe(true)
    expect(isClinicianProfile(null, null, 'Dr. Jane Smith, MD is accepting new patients.')).toBe(true)
  })
})

describe('isRecruiterTitle — sanity check, no equivalent short-word collision', () => {
  it('does not flag ordinary text', () => {
    expect(isRecruiterTitle('Founding Engineer')).toBe(false)
    expect(isRecruiterTitle('We need to source more leads for the pipeline.')).toBe(false)
  })

  it('still identifies real recruiter titles', () => {
    expect(isRecruiterTitle('Technical Recruiter')).toBe(true)
    expect(isRecruiterTitle('Talent Acquisition Partner')).toBe(true)
  })
})
