/**
 * V5.2 Upwork proposal quality contracts.
 *
 * A proposal must read like a senior freelancer wrote it: no rigid template,
 * no parotted job description, claims grounded in the selected profile's
 * evidence, length adapted to the job, and a humanization pass that can never
 * change a fact.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import { findUnsupportedClaims, buildSalesGenerationContext } from '@/lib/generation/sales-context'
import type { ProfileEvidence, GenerationTarget } from '@/lib/generation/sales-context'
import type { Profile } from '@/lib/domain/types'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const GENERATE = 'src/app/api/upwork/jobs/[id]/generate/route.ts'

describe('UPWORK_PROPOSAL_NO_RIGID_TEMPLATE', () => {
  it('the prompt offers structures instead of a fixed hook/proof/plan/question', () => {
    const source = read(GENERATE)
    expect(source).not.toMatch(/STRUCTURE \(follow exactly\)/)
    expect(source).toMatch(/choose what fits this job/i)
    expect(source).toMatch(/problem recognition/i)
  })
})

describe('UPWORK_PROPOSAL_OPENING_NOT_PARROTED', () => {
  it('the prompt forbids restating the job and forces a varied opening', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/Do NOT restate the job title/)
    expect(source).toMatch(/never the same grammatical/)
    expect(source).toMatch(/Never quote the job description back/)
  })
})

describe('UPWORK_PROPOSAL_QUESTION_OPTIONAL', () => {
  it('a question and a plan are earned, not forced', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/QUESTION \(optional\)/)
    expect(source).toMatch(/PLAN \(optional\)/)
    expect(source).toMatch(/Do not invent a timeline/)
  })
})

describe('UPWORK_PROPOSAL_LENGTH_ADAPTIVE', () => {
  it('the word band follows job complexity, not a constant', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/const complexity = \[/)
    expect(source).toMatch(/const wordBand: \[number, number\] = complexity >= 2/)
    expect(source).not.toMatch(/\$\{COVER_LETTER_WORDS\[0\]\}-\$\{COVER_LETTER_WORDS\[1\]\}/)
  })
})

describe('UPWORK_PROPOSAL_CLAIM_SAFE', () => {
  it('unsupported claims are surfaced from the proposal and every screening answer', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/findUnsupportedClaims\(letterGate\.text, generationContext\)/)
    expect(source).toMatch(/\[Screening\]/)
  })

  it('a claim naming a canonical entity is supported; an invented metric is not', () => {
    const evidence: ProfileEvidence = {
      proofCards: [],
      proofItems: [],
      portfolioProjects: [
        {
          id: 'p1',
          title: 'Fullscript OAuth',
          role: 'Engineer',
          description: 'Rails OAuth integrations with major identity providers',
          technologies: ['Ruby on Rails', 'OAuth'],
          clientCompany: 'Fullscript',
          outcome: 'Shipped provider integrations',
        },
      ],
      experience: [],
      reviews: [],
      claims: [],
    }
    const context = buildSalesGenerationContext({
      profile: { id: 'profile-1', displayName: 'Aneeb', platform: 'upwork' } as Profile,
      evidence,
      channel: 'upwork',
      target: { channel: 'upwork', title: 'Rails OAuth' } as GenerationTarget,
    })
    const supported = findUnsupportedClaims('At Fullscript I worked on Rails OAuth integrations.', context)
    const invented = findUnsupportedClaims('I improved deployment efficiency by 47%.', context)
    expect(supported).toEqual([])
    expect(invented.length).toBeGreaterThan(0)
  })
})

describe('UPWORK_PROPOSAL_PROFILE_SCOPED', () => {
  it('evidence is loaded for the selected profile only', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/store\.getProfileEvidence\(profile\.id\)/)
    expect(source).not.toMatch(/getProfileEvidence\(profiles\[0\]\.id\)/)
  })
})

describe('UPWORK_HUMANIZATION_PRESERVES_FACTS', () => {
  it('the humanization pass only runs on a structural tell and is re-validated', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/checkHumanization\(sanitized\.text\)/)
    expect(source).toMatch(/rewriteToHumanize\(sanitized\.text, humanization\.flaggedTells\)/)
    // The claim gate runs after humanization, on the final text.
    expect(source).toMatch(/evaluateCoverLetter\(humanized\.text/)
    expect(source).toMatch(/findUnsupportedClaims\(letterGate\.text, generationContext\)/)
  })

  it('the rewrite changes phrasing only — a named fact survives', () => {
    const text = 'At Fullscript I worked on Rails OAuth integrations. Moreover, the team shipped quickly.'
    const result = checkHumanization(text)
    const rewritten = rewriteToHumanize(text, result.flaggedTells)
    expect(rewritten).toContain('Fullscript')
    expect(rewritten).toContain('Rails OAuth')
  })
})

describe('UPWORK_PREMIUM_NOT_JUST_LONGER', () => {
  it('premium changes reasoning and evidence selection, not just tokens', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/PREMIUM MODE/)
    expect(source).toMatch(/Draft two candidate openings/)
    expect(source).toMatch(/strongest evidence for THIS job/)
  })

  it('no client-history source is wired, so no "unknown" block reaches the prompt', () => {
    const source = read(GENERATE)
    expect(source).not.toMatch(/CLIENT RESEARCH/)
    expect(source).not.toMatch(/Hire rate: unknown/)
  })
})

describe('UPWORK_STANDARD_SENDABLE', () => {
  it('standard mode uses the same gate, the same proof and the same claim rules', () => {
    const source = read(GENERATE)
    expect(source).toMatch(/generationMode === 'premium' \? 'premium' : 'standard'/)
    // The gate is unconditional — standard is never exempt.
    expect(source).toMatch(/const letterGate = evaluateCoverLetter\(humanized\.text, jobCtx, profileCtx, wordBand\)/)
  })
})

describe('UPWORK_SCREENING_PERSISTS + CLAIM_SAFE', () => {
  it('screening answers are persisted with the application and claim-checked', () => {
    const apply = read('src/app/api/upwork/jobs/[id]/apply/route.ts')
    expect(apply).toMatch(/screeningAnswers/)
    const source = read(GENERATE)
    expect(source).toMatch(/evaluateScreeningAnswers\(/)
    expect(source).toMatch(/findUnsupportedClaims\(answer\.answer, generationContext\)/)
  })
})

describe('UPWORK_SUBMITTED_VERSION_IMMUTABLE', () => {
  it('submission stores the proposal version and never regenerates it', () => {
    const apply = read('src/app/api/upwork/jobs/[id]/apply/route.ts')
    expect(apply).toMatch(/proposalVersionId/)
    expect(apply).not.toMatch(/generate<ProposalResult>/)
  })
})

describe('UPWORK_CROSS_PROFILE_PROOF_DENIED', () => {
  it('evidence comes from the selected identity person, never another profile', () => {
    const source = read(GENERATE)
    // One profile is resolved, then its evidence is loaded by that id.
    expect(source).toMatch(/const evidence = await store\.getProfileEvidence\(profile\.id\)/)
    expect(source).toMatch(/const requestedProfileId = typeof body\.profileId === 'string'/)
  })
})
