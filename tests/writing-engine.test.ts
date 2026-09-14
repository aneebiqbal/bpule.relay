import { describe, it, expect } from 'vitest'
import {
  BANNED_PHRASES,
  AI_TELL_PHRASES,
  checkOriginality,
  runQualityGate,
  selectStructure,
  structureToPrompt,
  analyzeForInsight,
  type ContentStructure,
} from '@/lib/writing/engine'
import {
  generateVisualConcept,
  isVisualConceptOriginal,
  type VisualConceptInput,
} from '@/lib/writing/visual'

describe('Writing Engine: Banned Phrases', () => {
  it('includes common AI tells in banned list', () => {
    expect(BANNED_PHRASES).toContain("here's the thing")
    expect(BANNED_PHRASES).toContain('let that sink in')
    expect(BANNED_PHRASES).toContain('nobody talks about this')
    expect(BANNED_PHRASES).toContain('stop scrolling')
    expect(BANNED_PHRASES).toContain('game changer')
  })

  it('includes sales AI tells in banned list', () => {
    expect(BANNED_PHRASES).toContain('i came across your')
    expect(BANNED_PHRASES).toContain("i'd love the opportunity")
    expect(BANNED_PHRASES).toContain('just following up')
    expect(BANNED_PHRASES).toContain('checking in')
    expect(BANNED_PHRASES).toContain('hope this finds you well')
  })

  it('includes corporate AI tells', () => {
    expect(AI_TELL_PHRASES).toContain('delve into')
    expect(AI_TELL_PHRASES).toContain('leverage the power')
    expect(AI_TELL_PHRASES).toContain('synergy')
    expect(AI_TELL_PHRASES).toContain('pain point')
    expect(AI_TELL_PHRASES).toContain('moving the needle')
  })
})

describe('Writing Engine: Originality Check', () => {
  it('flags banned phrases in text', () => {
    const result = checkOriginality("Here's the thing about React: it's great.", [])
    expect(result.isOriginal).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('flags AI tell phrases', () => {
    const result = checkOriginality('We need to leverage the power of synergy to move the needle.', [])
    expect(result.isOriginal).toBe(false)
    expect(result.issues.some(i => i.includes('AI tell'))).toBe(true)
  })

  it('flags "It\'s not X, it\'s Y" pattern', () => {
    const result = checkOriginality("It's not about speed. It's about correctness.", [])
    expect(result.isOriginal).toBe(false)
    expect(result.issues.some(i => i.includes('cliché contrast'))).toBe(true)
  })

  it('flags excessive one-line paragraphs', () => {
    const text = ['Line one.', 'Line two.', 'Line three.', 'Line four.', 'Line five.', 'Line six.'].join('\n')
    const result = checkOriginality(text, [])
    expect(result.isOriginal).toBe(false)
    expect(result.issues.some(i => i.includes('one-line paragraphs'))).toBe(true)
  })

  it('flags similarity to recent content', () => {
    const recent = ['The deployment failed because of a stale environment variable in production.']
    const result = checkOriginality('The deployment broke due to a stale env var in production.', recent)
    expect(result.isOriginal).toBe(false)
    expect(result.issues.some(i => i.includes('similar'))).toBe(true)
  })

  it('passes original text', () => {
    const result = checkOriginality('The timing of the failure made me blame a healthy deployment.', [])
    expect(result.isOriginal).toBe(true)
    expect(result.score).toBe(1)
  })
})

describe('Writing Engine: Quality Gate', () => {
  it('rejects generic opening', () => {
    const result = runQualityGate("In today's fast-paced world, things are changing.", 'Things are changing rapidly.', {
      checkOriginality: false,
      checkSpecificity: false,
    })
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.includes("In today's"))).toBe(true)
  })

  it('rejects engagement-bait closing', () => {
    const result = runQualityGate('Some good content here.\nThoughts?', 'Good content material.', {
      checkOriginality: false,
      checkSpecificity: false,
    })
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.includes('engagement-bait'))).toBe(true)
  })

  it('rejects excessive em dashes', () => {
    const result = runQualityGate('First—second—third—fourth—fifth.', 'Material with dashes.', {
      checkOriginality: false,
      checkSpecificity: false,
    })
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.includes('em dash'))).toBe(true)
  })

  it('rejects both-sides hedging', () => {
    const result = runQualityGate(
      'On the one hand, this approach works. But on the other hand, there are tradeoffs. That said, it depends.',
      'Material about tradeoffs.',
      { checkOriginality: false, checkSpecificity: false },
    )
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.includes('both-sides'))).toBe(true)
  })

  it('rejects uniform sentence rhythm', () => {
    const result = runQualityGate(
      'This is a sentence of medium length. Another sentence of similar size. Yet another one right here. And one more for good measure.',
      'Material about sentences.',
      { checkOriginality: false, checkSpecificity: false },
    )
    expect(result.passed).toBe(false)
    expect(result.issues.some(i => i.includes('Uniform sentence rhythm'))).toBe(true)
  })

  it('passes quality content', () => {
    const result = runQualityGate(
      'The deployment looked healthy. Production behavior did not match. One environment value was stale.',
      'A deployment looked healthy but production behavior was wrong because of a stale environment variable.',
      { checkOriginality: false },
    )
    expect(result.passed).toBe(true)
  })
})

describe('Writing Engine: Structure Selection', () => {
  it('selects mistake_to_lesson for debugging stories', () => {
    const result = selectStructure(
      'I made a mistake debugging a deployment. The issue was a stale env var.',
      [],
      'personal',
    )
    expect(result.structure).toBe('mistake_to_lesson')
  })

  it('selects technical_breakdown for how-to content', () => {
    const result = selectStructure(
      'How I configured the deployment pipeline to use environment variables correctly.',
      [],
      'personal',
    )
    expect(result.structure).toBe('technical_breakdown')
  })

  it('selects contrarian_argument for opinion content', () => {
    const result = selectStructure(
      'Most people think microservices are always the answer. They should reconsider.',
      [],
      'opinion',
    )
    expect(result.structure).toBe('contrarian_argument')
  })

  it('avoids repeating recent structures', () => {
    const recent: ContentStructure[] = ['mistake_to_lesson', 'mistake_to_lesson', 'mistake_to_lesson']
    const result = selectStructure(
      'I made a mistake debugging a deployment.',
      recent,
      'personal',
    )
    // Should pick something other than mistake_to_lesson since it's been overused
    expect(result.structure).not.toBe('mistake_to_lesson')
  })

  it('provides a reason for structure selection', () => {
    const result = selectStructure('I chose to use PostgreSQL instead of MongoDB.', [], 'personal')
    expect(result.reason.length).toBeGreaterThan(0)
  })

  it('structureToPrompt returns a directive for each structure', () => {
    const structures: ContentStructure[] = [
      'observation', 'story_to_realization', 'mistake_to_lesson', 'technical_breakdown',
      'contrarian_argument', 'short_insight', 'field_note',
    ]
    for (const s of structures) {
      const prompt = structureToPrompt(s)
      expect(prompt.length).toBeGreaterThan(10)
    }
  })
})

describe('Writing Engine: Insight Analysis', () => {
  it('finds expectation vs reality in debugging story', () => {
    const result = analyzeForInsight(
      'I thought the deployment was broken. But actually it was just a stale config value.',
    )
    expect(result.hasStrongAngle).toBe(true)
    expect(result.expectation).toContain('thought')
    expect(result.reality).toContain('actually')
  })

  it('identifies specific details', () => {
    const result = analyzeForInsight(
      'The deployment used port 3000 but the load balancer was configured for port 8080.',
    )
    expect(result.specificDetail).toContain('3000')
  })

  it('flags missing elements for vague input', () => {
    const result = analyzeForInsight('Docker is hard.')
    expect(result.hasStrongAngle).toBe(false)
    expect(result.missingElements.length).toBeGreaterThan(0)
  })
})

describe('Visual Concept Generator', () => {
  it('generates a visual concept for a debugging story', () => {
    const input: VisualConceptInput = {
      postText: 'The deployment looked healthy. Production behavior did not match. One environment value was stale.',
      platform: 'linkedin',
      angle: 'The timing of a failure made me blame a healthy deployment',
      topic: 'Production Debugging',
      coreDetail: 'A deployment pipeline showing healthy stages while one config value is stale',
      tone: 'serious',
    }
    const concept = generateVisualConcept(input)
    expect(concept.visualIdea.length).toBeGreaterThan(10)
    expect(concept.imagePrompt.length).toBeGreaterThan(20)
  })

  it('selects technical-diagram for debugging content', () => {
    const input: VisualConceptInput = {
      postText: 'How I debugged a stale configuration issue',
      platform: 'linkedin',
      angle: 'Debugging deployment issues',
      topic: 'Debugging',
      coreDetail: 'A configuration mismatch between deployment and runtime',
      tone: 'serious',
    }
    const concept = generateVisualConcept(input)
    expect(concept.imagePrompt).toContain('diagram')
  })

  it('selects visual-metaphor for lesson content', () => {
    const input: VisualConceptInput = {
      postText: 'I learned that the timing of a failure can mislead you',
      platform: 'linkedin',
      angle: 'Lesson about failure timing',
      topic: 'Lessons',
      coreDetail: 'The timing of failure misled the investigation',
      tone: 'thoughtful',
    }
    const concept = generateVisualConcept(input)
    expect(concept.imagePrompt).toContain('metaphor')
  })

  it('never uses generic imagery as the main subject', () => {
    const input: VisualConceptInput = {
      postText: 'A technical observation about database queries',
      platform: 'linkedin',
      angle: 'Database optimization',
      topic: 'Databases',
      coreDetail: 'A query that scans the full table',
      tone: 'serious',
    }
    const concept = generateVisualConcept(input)
    // The negative constraints list "No robots/laptops" etc. — verify these only appear as exclusions
    const prompt = concept.imagePrompt
    const negativeConstraintSection = prompt.slice(prompt.indexOf('No people'))
    const beforeConstraints = prompt.slice(0, prompt.indexOf('No people'))
    // Before the negative constraints, there should be no generic subjects
    expect(beforeConstraints).not.toMatch(/\blaptop\b/i)
    expect(beforeConstraints).not.toMatch(/\brobot\b/i)
    expect(beforeConstraints).not.toMatch(/stock\s+photo/i)
    expect(beforeConstraints).not.toMatch(/ai\s+brain/i)
    // Negative constraints should exist (proving they're excluded)
    expect(negativeConstraintSection).toContain('No robots')
    expect(negativeConstraintSection).toContain('No laptops')
  })

  it('includes aspect ratio for platform', () => {
    const linkedinInput: VisualConceptInput = {
      postText: 'Test',
      platform: 'linkedin',
      angle: 'Test',
      topic: 'Test',
      coreDetail: 'Test detail',
      tone: 'serious',
    }
    const linkedinConcept = generateVisualConcept(linkedinInput)
    expect(linkedinConcept.imagePrompt).toContain('landscape')

    const xInput: VisualConceptInput = {
      postText: 'Test',
      platform: 'x',
      angle: 'Test',
      topic: 'Test',
      coreDetail: 'Test detail',
      tone: 'serious',
    }
    const xConcept = generateVisualConcept(xInput)
    expect(xConcept.imagePrompt).toContain('16:9')
  })

  it('generates different concepts for different posts', () => {
    const input1: VisualConceptInput = {
      postText: 'A story about a deployment failure',
      platform: 'linkedin',
      angle: 'Deployment debugging',
      topic: 'DevOps',
      coreDetail: 'A deployment pipeline with a hidden config issue',
      tone: 'serious',
    }
    const input2: VisualConceptInput = {
      postText: 'An opinion about code review culture',
      platform: 'linkedin',
      angle: 'Code review opinions',
      topic: 'Engineering Culture',
      coreDetail: 'Most teams treat code review as a rubber stamp',
      tone: 'thoughtful',
    }
    const concept1 = generateVisualConcept(input1)
    const concept2 = generateVisualConcept(input2)
    expect(concept1.imagePrompt).not.toBe(concept2.imagePrompt)
  })
})
