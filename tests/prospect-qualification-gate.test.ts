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
})
