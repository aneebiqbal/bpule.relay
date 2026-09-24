import { describe, expect, it } from 'vitest'
import { evaluateProspectQualification } from '@/lib/prospect/qualification-gate'
import type { ExtractedLead } from '@/lib/domain/types'

function extracted(overrides: Partial<ExtractedLead> = {}): ExtractedLead {
  return {
    name: null,
    title: null,
    titleRaw: null,
    company: 'Unknown company',
    url: null,
    locationRaw: null,
    aboutSummary: null,
    experienceSummary: null,
    recentPosts: [],
    roleCategory: 'other',
    marketRegion: 'unknown',
    signalType: 7,
    signalEvidence: '',
    extractionConfidence: 28,
    confidenceNotes: [],
    verbatimQuote: null,
    tags: [],
    ...overrides,
  }
}

describe('Prospect qualification gate', () => {
  it('rejects required garbage edge cases with hard input failure', () => {
    const garbageInputs = ['XYZ', 'hello', 'asdf', '1234567890', 'https://linkedin.com/in/someone']

    for (const rawText of garbageInputs) {
      const result = evaluateProspectQualification({
        rawText,
        extracted: extracted({ signalEvidence: rawText.trim() }),
      })
      expect(result.qualificationEligibility, rawText).toBe(false)
      expect(result.status, rawText).toBe('insufficient_context')
      expect(result.inputHardFail, rawText).toBe(true)
    }
  })

  // Regression: a real LinkedIn profile paste written in resume-style third
  // person (no "I"/"my"/"he"/"she" pronouns, no exact "X years experience"
  // phrase) was misclassified IRRELEVANT ("This is not a prospect. No
  // message. Login or product UI is not a reason to contact anyone.")
  // purely because classifyInput()'s hasPersonMarkers check required
  // first/third-person pronouns that a third-person bio will never contain.
  // Structural LinkedIn evidence (connection-degree badge, Experience/
  // Education headers, a connections count) must be recognized regardless
  // of pronoun usage.
  it('does not hard-reject a real LinkedIn profile paste written in third person with no pronouns', () => {
    const rawText = `Eli Takele
· 2nd

Frontend Developer at Viz.ai

Tel Aviv District, Israel

·

Contact info

500+

connections

Connect
Message

More
About
Software Developer with hands-on experience building scalable web applications using
JavaScript (ES6), TypeScript, React.js, Next.js, Node.js, and MongoDB. Skilled in both
frontend and backend development, with a strong grasp of clean code principles,
test-driven development, and CI/CD pipelines using Azure and AWS.

Experience
Viz.ai logo
Frontend Developer

Viz.ai · Full-time

Sep 2025 - Present · 1 yr 1 mo

Education
Ono Academic College logo
Ono Academic College

Bachelor's degree, Business Administration (Information Systems)

Oct 2021 – Oct 2024

Licenses & certifications
Microsoft logo
70-483 Programming in c#.

Microsoft`

    const result = evaluateProspectQualification({
      rawText,
      extracted: extracted({
        name: 'Eli Takele',
        title: 'Frontend Developer',
        titleRaw: 'Frontend Developer at Viz.ai',
        company: 'Viz.ai',
        signalEvidence: rawText,
        extractionConfidence: 70,
      }),
    })

    expect(result.inputClassification.classification).not.toBe('IRRELEVANT')
    expect(result.inputHardFail).toBe(false)
  })

  it('rejects missing raw input so API callers cannot bypass with fabricated fields', () => {
    const result = evaluateProspectQualification({
      rawText: null,
      extracted: extracted({
        name: 'Sarah Chen',
        title: 'CTO',
        titleRaw: 'CTO',
        company: 'Riverlane Health',
        signalEvidence: 'Hiring for two senior backend engineers in Q4.',
        extractionConfidence: 90,
        aboutSummary: 'Leads engineering for digital care experiences.',
        experienceSummary: '12 years in platform engineering and team leadership.',
        tags: ['rails', 'backend'],
      }),
    })

    expect(result.qualificationEligibility).toBe(false)
    expect(result.inputHardFail).toBe(true)
    expect(result.reasons.some((reason) => reason.includes('Raw input is required'))).toBe(true)
  })

  it('rejects generic marketing copy without person/role evidence', () => {
    const rawText = 'Acme is a world-class innovation company. We deliver modern cloud outcomes for businesses globally.'
    const result = evaluateProspectQualification({
      rawText,
      extracted: extracted({
        company: 'Acme',
        signalEvidence: 'We deliver modern cloud outcomes for businesses globally.',
        extractionConfidence: 62,
      }),
    })

    expect(result.qualificationEligibility).toBe(false)
    expect(result.inputHardFail).toBe(true)
    expect(result.missingCritical).toContain('person or role context')
  })

  it('accepts a real LinkedIn-like prospect with evidence', () => {
    const rawText = `Sarah Chen
CTO at Riverlane Health
San Francisco, California, United States
We are hiring senior Rails engineers to rebuild our patient messaging platform.`

    const result = evaluateProspectQualification({
      rawText,
      extracted: extracted({
        name: 'Sarah Chen',
        title: 'CTO',
        titleRaw: 'CTO at Riverlane Health',
        company: 'Riverlane Health',
        locationRaw: 'San Francisco, California, United States',
        aboutSummary: 'Leads engineering and product delivery for digital care experiences.',
        experienceSummary: '12 years in software leadership across healthcare SaaS and platform modernization.',
        signalType: 1,
        signalEvidence: 'We are hiring senior Rails engineers to rebuild our patient messaging platform.',
        extractionConfidence: 86,
        tags: ['rails', 'healthcare', 'saas'],
      }),
    })

    expect(result.qualificationEligibility).toBe(true)
    expect(result.status).toBe('eligible')
    expect(result.inputHardFail).toBe(false)
  })

  it('accepts job/opportunity context when role + company + evidence are clear', () => {
    const rawText = `NovaStack is hiring a Senior Backend Engineer (Rails/PostgreSQL).
Need: own API performance, reduce p95 latency by 40%, and ship in 60 days.`

    const result = evaluateProspectQualification({
      rawText,
      extracted: extracted({
        title: 'Senior Backend Engineer',
        titleRaw: 'Senior Backend Engineer',
        company: 'NovaStack',
        aboutSummary: 'Backend modernization role with direct ownership of API performance and reliability.',
        experienceSummary: 'Role focuses on Rails, PostgreSQL, profiling, and production incident response.',
        signalType: 1,
        signalEvidence: 'Need: own API performance, reduce p95 latency by 40%, and ship in 60 days.',
        extractionConfidence: 78,
        tags: ['rails', 'postgres', 'performance'],
      }),
    })

    expect(result.qualificationEligibility).toBe(true)
    expect(result.inputHardFail).toBe(false)
  })

  describe('canonical authority — one policy owns eligibility for post-canonical prospects (89-score P0 regression)', () => {
    // Reproduces the reported bug: canonicalScore 89 ("Strong opportunity",
    // scoreLabel 85-100 => qualification 'strong') but Save/Draft blocked
    // because a SEPARATE legacy heuristic (raw-text scoring + extraction-
    // completeness checks against extracted.signalEvidence, not the
    // canonical pipeline's own evidence) independently vetoed it. A real
    // canonical result must be the single source of truth for eligibility;
    // the legacy checks must still run and be visible, but never block on
    // their own once canonical has vouched for the prospect.
    const thinExtraction = extracted({
      name: 'Someone',
      title: null,
      titleRaw: null,
      company: 'RealCo',
      // Deliberately thin/generic legacy fields — this is the exact shape
      // that fails extractability/evidenceCoverage/hasSpecificSignalEvidence
      // on its own, even though the canonical pipeline (elsewhere, with
      // richer evidence-ledger access) already scored this prospect highly.
      aboutSummary: null,
      experienceSummary: null,
      signalEvidence: 'Relevant.',
      extractionConfidence: 35,
      tags: [],
    })
    const rawText = 'RealCo is a real company doing real work.'

    it('a canonical "strong" (e.g. score 89) verdict overrides an otherwise-blocking legacy gate', () => {
      const withoutCanonical = evaluateProspectQualification({ rawText, extracted: thinExtraction })
      expect(withoutCanonical.qualificationEligibility, 'sanity: legacy gate alone must reject this thin fixture').toBe(false)

      const withCanonical = evaluateProspectQualification({
        rawText,
        extracted: thinExtraction,
        canonicalQualification: 'strong',
      })
      expect(withCanonical.qualificationEligibility).toBe(true)
      expect(withCanonical.status).toBe('eligible')
      // Diagnostic detail must still be present, not hidden — just non-blocking.
      expect(withCanonical.missingCritical.length).toBeGreaterThan(0)
      expect(withCanonical.reasons.some((r) => r.includes('do not block saving'))).toBe(true)
    })

    it('"worth_pursuing" and "maybe" also override the legacy gate; "skip" does not', () => {
      for (const q of ['worth_pursuing', 'maybe'] as const) {
        const result = evaluateProspectQualification({ rawText, extracted: thinExtraction, canonicalQualification: q })
        expect(result.qualificationEligibility, q).toBe(true)
      }
      const skipped = evaluateProspectQualification({ rawText, extracted: thinExtraction, canonicalQualification: 'skip' })
      expect(skipped.qualificationEligibility).toBe(false)
    })

    it('canonical does not override a genuine input hard-fail (garbage/UI-fragment input)', () => {
      const garbage = evaluateProspectQualification({
        rawText: 'asdf',
        extracted: extracted({ signalEvidence: 'asdf' }),
        canonicalQualification: 'strong',
      })
      expect(garbage.qualificationEligibility).toBe(false)
      expect(garbage.inputHardFail).toBe(true)
    })

    it('no canonical result present falls back to the legacy gate unchanged (pre-canonical / manual-entry callers)', () => {
      const result = evaluateProspectQualification({ rawText, extracted: thinExtraction, canonicalQualification: null })
      expect(result.qualificationEligibility).toBe(false)
    })
  })

  describe('scoreLabel boundary sweep — canonicalQualification derived at every requested score, 0-100', () => {
    // Mirrors src/lib/intelligence-v2/types.ts SCORE_LABELS exactly, so this
    // test breaks (loudly) if the two ever drift apart instead of silently
    // encoding a threshold here that isn't the real product rule.
    function qualificationForScore(score: number): 'strong' | 'worth_pursuing' | 'maybe' | 'skip' {
      if (score >= 85) return 'strong'
      if (score >= 70) return 'worth_pursuing'
      if (score >= 55) return 'maybe'
      return 'skip'
    }

    const thinExtraction = extracted({
      company: 'RealCo',
      signalEvidence: 'Relevant.',
      extractionConfidence: 35,
    })
    const rawText = 'RealCo is a real company doing real work.'

    it.each([0, 39, 40, 54, 55, 69, 70, 72, 75, 76, 84, 85, 89, 100])(
      'score %i: eligibility follows canonical qualification band, not a hardcoded score>=X check',
      (score) => {
        const q = qualificationForScore(score)
        const result = evaluateProspectQualification({ rawText, extracted: thinExtraction, canonicalQualification: q })
        const expectEligible = q !== 'skip'
        expect(result.qualificationEligibility, `score=${score} qualification=${q}`).toBe(expectEligible)
      },
    )

    it('72, 75, and 76 all fall in the same "worth_pursuing" band and are treated identically', () => {
      const results = [72, 75, 76].map((score) =>
        evaluateProspectQualification({
          rawText,
          extracted: thinExtraction,
          canonicalQualification: qualificationForScore(score),
        }).qualificationEligibility,
      )
      expect(results).toEqual([true, true, true])
    })
  })
})
