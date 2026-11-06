import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Profile, ProofCard } from '@/lib/domain/types'
import {
  buildSalesGenerationContext,
  classifyGenerationClaim,
  findUnsupportedClaims,
  formatEvidenceBlock,
  formatProfileBlock,
  formatTargetBlock,
  rankGenerationProof,
  toAllowedNumbers,
  type ProfileEvidence,
} from '@/lib/generation/sales-context'

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    repId: 'r1',
    organizationId: 'o1',
    platform: 'upwork',
    label: 'Hassan',
    profileUrl: 'https://upwork.com/freelancers/~real',
    headline: 'Full-stack engineer',
    createdAt: '2024-01-01',
    displayName: 'Hassan',
    currentRole: 'Senior Full-stack Engineer',
    professionalSummary: 'I build messaging and commerce platforms.',
    yearsExperience: 8,
    primarySkills: ['react', 'node'],
    technologies: ['typescript', 'postgres'],
    industries: ['ecommerce'],
    serviceCapabilities: ['web apps'],
    ...overrides,
  }
}

function evidence(overrides: Partial<ProfileEvidence> = {}): ProfileEvidence {
  return {
    proofCards: [
      {
        id: 'pc1',
        organizationId: 'o1',
        profileId: 'p1',
        capability: 'WhatsApp commerce platform',
        strength: 'strong',
        safeClaim: 'Built a WhatsApp Cloud API commerce checkout for a retail brand.',
        sourceType: 'client_work',
        sourceReference: 'https://example.com/work/whatsapp-commerce',
        tags: ['whatsapp', 'commerce', 'api'],
        verified: true,
        forbiddenClaims: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
      {
        id: 'pc2',
        organizationId: 'o1',
        profileId: 'p1',
        capability: 'Internal QA tool',
        strength: 'moderate',
        safeClaim: 'Built an internal QA dashboard for a logistics team.',
        sourceType: 'project',
        sourceReference: 'not a url',
        tags: ['qa', 'dashboard'],
        verified: true,
        forbiddenClaims: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
    ] as ProofCard[],
    proofItems: [],
    portfolioProjects: [
      {
        id: 'pp1',
        title: 'Messaging automation project',
        role: 'Lead engineer',
        description: 'Automated outbound messaging across WhatsApp and email.',
        technologies: ['whatsapp', 'automation'],
        clientCompany: null,
        outcome: 'Reduced manual outreach time.',
      },
    ],
    experience: [
      { id: 'e1', role: 'Senior Engineer', company: 'Acme', startDate: '2020', endDate: null, isCurrent: true },
    ],
    reviews: [
      {
        id: 'rv1',
        text: 'Delivered the commerce integration ahead of schedule.',
        reviewerName: 'Client',
        reviewerCompany: 'Retail Co',
        projectContext: 'WhatsApp commerce',
        safeForOutreach: true,
      },
    ],
    claims: [],
    ...overrides,
  }
}

function context(overrides: Partial<Parameters<typeof buildSalesGenerationContext>[0]> = {}) {
  return buildSalesGenerationContext({
    profile: profile(),
    evidence: evidence(),
    channel: 'upwork',
    target: {
      channel: 'upwork',
      title: 'WhatsApp commerce checkout',
      description: 'Need a WhatsApp Cloud API checkout for a retail brand.',
      requiredSkills: ['whatsapp', 'commerce'],
    },
    ...overrides,
  })
}

describe('GENERATION sales context', () => {
  it('ranks the project matching the job first and drops unrelated proof', () => {
    const ranked = rankGenerationProof(evidence(), {
      channel: 'upwork',
      title: 'WhatsApp commerce checkout',
      requiredSkills: ['whatsapp', 'commerce'],
    })
    expect(ranked[0].id).toBe('pc1')
    expect(ranked[0].kind).toBe('proof_card')
    // The QA dashboard shares no term with the job and is not forced in.
    expect(ranked.some((p) => p.id === 'pc2')).toBe(false)
  })

  it('includes a URL only when it is a real canonical URL', () => {
    const ctx = context()
    const block = formatEvidenceBlock(ctx)
    expect(block).toContain('https://example.com/work/whatsapp-commerce')
    expect(block).not.toContain('not a url')
  })

  it('omits unknown target values instead of inventing them', () => {
    const block = formatTargetBlock(
      context({ target: { channel: 'upwork', title: 'Role', description: 'Desc', requiredSkills: [], budget: null } }),
    )
    expect(block).not.toContain('Budget')
    expect(block).toContain('Role')
  })

  it('carries the normalized profile into the prompt', () => {
    const block = formatProfileBlock(context())
    expect(block).toContain('Hassan')
    expect(block).toContain('Senior Full-stack Engineer')
    expect(block).toContain('react')
  })

  it('allows numbers that appear in verified proof or profile facts only', () => {
    const numbers = toAllowedNumbers(context())
    expect(numbers.has('8')).toBe(true)
    expect(numbers.has('99')).toBe(false)
  })
})

describe('GENERATION claim safety', () => {
  it('VERIFIED_PROJECT_PROOF for a claim backed by a portfolio project', () => {
    expect(classifyGenerationClaim('I built a WhatsApp commerce platform.', context())).toBe('VERIFIED_PROJECT_PROOF')
  })

  it('VERIFIED_PROFILE_FACT for a claim backed by profile facts', () => {
    expect(classifyGenerationClaim('I have 8 years of experience.', context())).toBe('VERIFIED_PROFILE_FACT')
    expect(classifyGenerationClaim('I work with React and Node.', context())).toBe('VERIFIED_PROFILE_FACT')
  })

  it('CLIENT_STATED_FACT for a claim the client stated', () => {
    const ctx = context({
      conversation: { clientMessage: 'We are hiring a studio to build this for us.' },
    })
    expect(classifyGenerationClaim('You are hiring a studio.', ctx)).toBe('CLIENT_STATED_FACT')
  })

  it('UNKNOWN for an unsupported delivery claim', () => {
    expect(classifyGenerationClaim('I have successfully onboarded multiple clients.', context())).toBe('UNKNOWN')
    expect(classifyGenerationClaim('One notable project involved a retail platform.', context())).toBe('UNKNOWN')
  })

  it('UNKNOWN for an invented number', () => {
    expect(classifyGenerationClaim('I improved conversion by 47%.', context())).toBe('UNKNOWN')
  })

  it('SAFE_GENERAL_STATEMENT for a generic, entity-free sentence', () => {
    expect(classifyGenerationClaim('I would be happy to discuss the scope.', context())).toBe('SAFE_GENERAL_STATEMENT')
  })

  it('findUnsupportedClaims flags only the unsupported delivery sentences', () => {
    const text = 'I built a WhatsApp commerce platform. I have successfully onboarded multiple clients.'
    const unsupported = findUnsupportedClaims(text, context())
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0]).toContain('onboarded multiple clients')
  })

  it('findUnsupportedClaims does not flag plans, questions or job references', () => {
    const text = [
      'Hey, your goal to connect salons to WhatsApp Business accounts is clear.',
      'In the first days, I would collaborate with a Meta WhatsApp expert.',
      'How do you currently manage compliance checks for new integrations?',
      'However, I have led complex API integrations like the Messaging automation project.',
    ].join(' ')
    expect(findUnsupportedClaims(text, context())).toEqual([])
  })

  it('findUnsupportedClaims flags an invented price or timeline', () => {
    const text = 'I propose a fixed price of $1500 with a completion timeline of 3 weeks.'
    const unsupported = findUnsupportedClaims(text, context())
    expect(unsupported).toHaveLength(1)
    expect(unsupported[0]).toContain('$1500')
  })

  it('findUnsupportedClaims allows a number the client stated in the job', () => {
    const ctx = context({
      target: {
        channel: 'upwork',
        title: 'WhatsApp commerce checkout',
        description: 'Need a WhatsApp Cloud API checkout. Budget is $500.',
        requiredSkills: ['whatsapp', 'commerce'],
      },
    })
    expect(findUnsupportedClaims('Your stated budget of $500 is noted.', ctx)).toEqual([])
  })
})

describe('UPWORK screening separation', () => {
  it('never instructs the model to concatenate screening answers into the proposal', () => {
    const source = readFileSync(
      new URL('../src/app/api/upwork/jobs/[id]/generate/route.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toContain('Include answers at the end of the proposal')
    expect(source).toContain('The proposal body must NOT contain the screening answers')
    expect(source).toContain('"questionAnswers"')
  })

  it('keeps the proposal and screening answers as separate outputs', () => {
    const source = readFileSync(
      new URL('../src/app/api/upwork/jobs/[id]/generate/route.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('questionAnswers: answersGate.answers.map')
  })

  it('emits canonical attachments/links only, never an invented URL', () => {
    const source = readFileSync(
      new URL('../src/app/api/upwork/jobs/[id]/generate/route.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('attachmentsOrLinks')
    expect(source).not.toContain('example.com')
  })
})
