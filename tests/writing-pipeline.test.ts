import { describe, it, expect } from 'vitest'
import {
  evaluatePostQuality,
  isRegressionFixture,
  type QualityCheckResult,
} from '@/lib/content/quality-gate'
import { buildPostPlan, validateCoreInsight } from '@/lib/content/post-plan'
import type { ContentProfile, ContentIdeaCard, ContentJourneyEntry } from '@/lib/domain/types'

// ── Persona Fixtures ────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<ContentProfile> = {}): ContentProfile {
  return {
    id: 'profile-1',
    organizationId: 'org-test',
    personaId: 'persona-1',
    role: 'Senior Software Engineer',
    seniority: 'Senior',
    industries: ['SaaS'],
    audience: 'Software Engineers',
    expertise: [
      { area: 'Rails', level: 'expert', evidence: 'Detected in profile', updatedAt: '' },
      { area: 'React', level: 'advanced', evidence: 'Detected in profile', updatedAt: '' },
      { area: 'System Architecture', level: 'expert', evidence: 'Inferred from role', updatedAt: '' },
    ],
    technologies: [],
    goals: [],
    topicsCared: [],
    topicsAvoided: [],
    opinions: [
      { belief: 'Most Rails performance issues start with query shape, not infrastructure', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '' },
    ],
    projects: [],
    experiences: [],
    writingCharacteristics: {},
    storytellingTendencies: [],
    confidence: 0.8,
    lastLearnedAt: null,
    audiences: ['Software Engineers', 'Engineering Leaders'],
    territories: ['Rails Architecture', 'System Design', 'Technical Leadership'],
    voiceSelection: 'technical',
    contentGoals: ['build_authority', 'grow_my_network'],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function makeIdea(overrides: Partial<ContentIdeaCard> = {}): ContentIdeaCard {
  return {
    id: 'idea-1',
    title: 'Something most people get wrong about Rails performance',
    angle: 'Teach a counterintuitive lesson about query shape and serialization boundaries before infrastructure',
    whyYou: 'You have expert expertise in Rails',
    whyAudience: 'Your audience faces this daily',
    sourceKind: 'expertise',
    territory: 'authority',
    confidence: 0.85,
    ...overrides,
  }
}

// ── Test Posts ───────────────────────────────────────────────────────────────

const STRONG_TECHNICAL_POST = `Most Rails performance work should start with query shape and serialization boundaries before touching infrastructure.

The pattern I see repeatedly: teams reach for caching or more hardware when the real issue is N+1 queries triggered by serialization. A single endpoint generating 4,000 index scans because the serializer walks associations is not an infrastructure problem.

The fix is usually adding a composite index or preloading associations. Counterintuitively, removing a cache layer sometimes improves p99 latency because the cache itself was the bottleneck.

Before scaling your database, check what queries your serializers actually trigger.`

const STRONG_FOUNDER_POST = `Most early-stage startups over-engineer their architecture before finding product-market fit.

The temptation is real: you want to build something scalable from day one. But here's the tension — every hour spent on microservices abstraction is an hour not spent talking to customers.

The companies that move fastest in the early days optimize for learning velocity, not technical elegance. That doesn't mean shipping garbage. It means accepting that your architecture will need to be rebuilt once you know what you're actually building.

The real risk isn't technical debt. It's building something nobody wants with a beautiful architecture.`

const STRONG_BD_POST = `The best outreach doesn't feel like outreach.

Most BD messages start with "I came across your company" or "I noticed you're hiring." Everyone uses the same templates, so everyone sounds the same.

What works differently: reference something specific about their work. Not their job title — their actual work. A technical decision they made, a product launch, a blog post they wrote.

The mechanism is simple: specificity signals genuine interest. Generic signals mass outreach.

When I switched from template-heavy outreach to research-first messaging, my reply rate tripled. Not because the product changed — because the approach showed I actually cared.`

const STRONG_DESIGNER_POST = `Most design systems fail not because of technical limitations, but because of adoption friction.

You can build the most elegant component library in the world, but if developers need to read 20 pages of documentation to use a button, they'll just build their own.

The insight: design systems succeed when they're easier to use correctly than incorrectly. That means sensible defaults, clear error states, and documentation that answers "what should I use here?" not "what does this prop do?"

The best design system constraint isn't a technical one — it's a human one. Make the right thing easy.`

const STRONG_PERSONAL_REFLECTION = `Five years ago, I thought leadership meant having all the answers.

Then I became an engineering manager and realized that was completely wrong.

The shift wasn't about technical depth — it was about context. As an IC, I focused on the best technical solution. As a leader, I need to balance technical merit with team capacity, business priorities, and the reality that sometimes "good enough now" beats "perfect next quarter."

The hardest part wasn't learning new skills. It was unlearning the instinct to optimize for technical elegance above all else.

I still miss pure engineering work sometimes. But I've learned that enabling a team to ship is its own kind of craft.`

const GENERIC_MOTIVATIONAL_POST = `The other day I was thinking about how important it is to keep things simple.

In today's fast-paced world, we often overcomplicate what's already simple. The truth is, consistency matters and we should focus on the basics.

Here are the key takeaways:
- Stay curious
- Trust the process
- Learn from mistakes
- Work smarter, not harder

At the end of the day, progress happens when we cut the noise and stick to the basics. Let that sink in.`

const FABRICATED_ANECDOTE_POST = `Yesterday I spent four hours debugging a race condition in our CI pipeline. Turns out two tests were sharing mutable state.

The devs handed me a configuration file that wasn't even documented. A colleague told me they had seen this before but nobody had written it down.

During a meeting last week, we discussed how to fix it. My team said they would update the documentation but nothing happened.

I realized that we need to be more careful about shared state. The lesson: always use transactions in your test setup.`

const KEYWORD_STUFFED_POST = `Rails React React Rails architecture architecture. As a Senior Software Engineer with expertise in Rails and React and system architecture, I believe that Rails React architecture is important.

The Rails framework combined with React and proper system architecture creates excellent Rails React architecture solutions. My React experience combined with Rails knowledge and architecture skills make me qualified to discuss Rails, React, and architecture.

In conclusion, Rails plus React plus architecture equals success.`

const VALID_POST_NO_NUMBERS = `The best technical decisions I've seen happen when teams slow down to understand the problem space before writing code.

It sounds counterintuitive. Moving fast feels productive. But teams that spend time mapping the problem — understanding edge cases, constraints, and failure modes — tend to write less code, not more.

The mechanism is straightforward: clarity about the problem prevents over-engineering the solution. When you understand what actually needs to happen, you stop building for hypothetical futures.

This isn't about analysis paralysis. It's about spending 20% of your time on understanding to save 80% on rework.`

const VALID_POST_NO_TECHNICAL = `The best founders I know share a specific trait: they say no more than yes.

Every feature request, partnership opportunity, or "quick meeting" is a tradeoff. Saying yes to one thing means saying no to something else.

The mechanism is opportunity cost. Every yes consumes time, attention, and team capacity that could go elsewhere. Founders who understand this don't just evaluate opportunities — they actively protect their team's focus.

This doesn't mean being closed-minded. It means being clear about what matters right now and being honest about what can wait.`

const GARBLED_INPUT_RESPONSE = `The PostgreSQL Supabase integration with Meilisearch is important for Next.js applications.

We need to consider the basica nothinig alread overcomplicate somethign in the system.

The devs handed me a config file that wasn't documented properly.`

// ── Regression Fixture ──────────────────────────────────────────────────────

const REGRESSION_FIXTURE = `The other day I was thinking about how important it is to keep things simple.

In today's fast-paced world, we often overcomplicate what's already simple. The truth is, consistency matters and we should focus on the basics.

The devs handed me a configuration file that wasn't even documented. "Here," they said, "fix this." No nothinig was labeled properly.

Cut the noise and stick to the basics. Progress happens when we overcomplicate what's already simple.`

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Quality Gate: Regression Fixture', () => {
  it('rejects the original bad production post', () => {
    const profile = makeProfile()
    const result = evaluatePostQuality({
      caption: REGRESSION_FIXTURE,
      personaContext: {
        expertise: profile.expertise.map((e) => e.area),
        audiences: profile.audiences ?? [],
        goals: profile.contentGoals ?? [],
        projects: profile.projects.map((p) => p.name),
        opinions: profile.opinions.map((o) => o.belief),
        territories: profile.territories ?? [],
        role: profile.role,
      },
      sourceMaterial: 'Rails performance',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(false)
    const codes = result.failures.map((f) => f.code)
    expect(codes).toContain('UNSUPPORTED_PERSONAL_CLAIM')
    expect(codes).toContain('GENERIC_INSIGHT')
  })

  it('isRegressionFixture quick check catches known bad strings', () => {
    expect(isRegressionFixture(REGRESSION_FIXTURE)).toBe(true)
    expect(isRegressionFixture(STRONG_TECHNICAL_POST)).toBe(false)
  })
})

describe('Quality Gate: True Positives (Should Pass)', () => {
  const profile = makeProfile()

  it('accepts strong technical post with mechanism and specificity', () => {
    const result = evaluatePostQuality({
      caption: STRONG_TECHNICAL_POST,
      personaContext: {
        expertise: profile.expertise.map((e) => e.area),
        audiences: profile.audiences ?? [],
        goals: profile.contentGoals ?? [],
        projects: profile.projects.map((p) => p.name),
        opinions: profile.opinions.map((o) => o.belief),
        territories: profile.territories ?? [],
        role: profile.role,
      },
      sourceMaterial: 'Rails performance query shape N+1 serialization',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(true)
  })

  it('accepts strong founder post without technical terms or numbers', () => {
    const result = evaluatePostQuality({
      caption: STRONG_FOUNDER_POST,
      personaContext: {
        expertise: ['Company Building', 'Product Strategy'],
        audiences: ['Startup Founders', 'Investors'],
        goals: ['get_clients', 'grow_my_company'],
        projects: [],
        opinions: [],
        territories: ['Company Building', 'Leadership'],
        role: 'Founder',
      },
      sourceMaterial: 'startup product-market fit engineering tradeoffs',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(true)
  })

  it('accepts strong BD post with mechanism and heuristic', () => {
    const result = evaluatePostQuality({
      caption: STRONG_BD_POST,
      personaContext: {
        expertise: ['Sales Strategy', 'Outreach'],
        audiences: ['Founders', 'Sales Leaders'],
        goals: ['get_clients', 'build_authority'],
        projects: [],
        opinions: [],
        territories: ['Sales Strategy', 'Business Development'],
        role: 'Sales Professional',
      },
      sourceMaterial: 'outreach templates reply rate specificity',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(true)
  })

  it('accepts strong designer post without technical jargon', () => {
    const result = evaluatePostQuality({
      caption: STRONG_DESIGNER_POST,
      personaContext: {
        expertise: ['Design Systems', 'UX Strategy'],
        audiences: ['Product Designers', 'UX Leads'],
        goals: ['build_authority', 'share_what_i_learn'],
        projects: [],
        opinions: [],
        territories: ['Design Systems', 'Product Design'],
        role: 'Product Designer',
      },
      sourceMaterial: 'design systems adoption friction developer experience',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(true)
  })

  it('accepts strong personal reflection', () => {
    const result = evaluatePostQuality({
      caption: STRONG_PERSONAL_REFLECTION,
      personaContext: {
        expertise: ['Engineering Leadership', 'Team Building'],
        audiences: ['Engineering Leaders', 'CTOs'],
        goals: ['share_what_i_learn', 'build_authority'],
        projects: [],
        opinions: [],
        territories: ['Engineering Leadership', 'Career Journey'],
        role: 'Engineering Manager',
      },
      sourceMaterial: 'engineering management leadership lessons career transition',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(true)
  })

  it('accepts valid post with no numbers or technical terms', () => {
    const result = evaluatePostQuality({
      caption: VALID_POST_NO_NUMBERS,
      personaContext: {
        expertise: ['Software Engineering', 'Technical Strategy'],
        audiences: ['Software Engineers', 'Engineering Leaders'],
        goals: ['build_authority', 'share_what_i_learn'],
        projects: [],
        opinions: [],
        territories: ['Engineering Lessons', 'Technical Decisions'],
        role: 'Senior Software Engineer',
      },
      sourceMaterial: 'technical decisions problem space understanding',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(true)
  })

  it('accepts valid post with no technical vocabulary (founder perspective)', () => {
    const result = evaluatePostQuality({
      caption: VALID_POST_NO_TECHNICAL,
      personaContext: {
        expertise: ['Company Building', 'Leadership'],
        audiences: ['Startup Founders', 'CEOs'],
        goals: ['build_authority', 'share_what_i_learn'],
        projects: [],
        opinions: [],
        territories: ['Company Building', 'Leadership Lessons'],
        role: 'Founder',
      },
      sourceMaterial: 'founder focus opportunity cost saying no',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(true)
  })
})

describe('Quality Gate: True Negatives (Should Reject)', () => {
  const profile = makeProfile()

  it('rejects generic motivational post', () => {
    const result = evaluatePostQuality({
      caption: GENERIC_MOTIVATIONAL_POST,
      personaContext: {
        expertise: profile.expertise.map((e) => e.area),
        audiences: profile.audiences ?? [],
        goals: profile.contentGoals ?? [],
        projects: profile.projects.map((p) => p.name),
        opinions: profile.opinions.map((o) => o.belief),
        territories: profile.territories ?? [],
        role: profile.role,
      },
      sourceMaterial: 'engineering performance',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(false)
    const codes = result.failures.map((f) => f.code)
    expect(codes).toContain('GENERIC_INSIGHT')
  })

  it('rejects post with fabricated anecdotes (third-person claims)', () => {
    const result = evaluatePostQuality({
      caption: FABRICATED_ANECDOTE_POST,
      personaContext: {
        expertise: profile.expertise.map((e) => e.area),
        audiences: profile.audiences ?? [],
        goals: profile.contentGoals ?? [],
        projects: profile.projects.map((p) => p.name),
        opinions: profile.opinions.map((o) => o.belief),
        territories: profile.territories ?? [],
        role: profile.role,
      },
      sourceMaterial: 'CI pipeline race condition debugging',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(false)
    const codes = result.failures.map((f) => f.code)
    expect(codes).toContain('UNSUPPORTED_PERSONAL_CLAIM')
  })

  it('rejects keyword-stuffed post (low information density)', () => {
    const result = evaluatePostQuality({
      caption: KEYWORD_STUFFED_POST,
      personaContext: {
        expertise: profile.expertise.map((e) => e.area),
        audiences: profile.audiences ?? [],
        goals: profile.contentGoals ?? [],
        projects: profile.projects.map((p) => p.name),
        opinions: profile.opinions.map((o) => o.belief),
        territories: profile.territories ?? [],
        role: profile.role,
      },
      sourceMaterial: 'Rails React architecture expertise',
      platform: 'linkedin',
    })

    expect(result.passed).toBe(false)
  })

  it('rejects post with garbled words (malformed source handling)', () => {
    const result = evaluatePostQuality({
      caption: GARBLED_INPUT_RESPONSE,
      personaContext: {
        expertise: profile.expertise.map((e) => e.area),
        audiences: profile.audiences ?? [],
        goals: profile.contentGoals ?? [],
        projects: profile.projects.map((p) => p.name),
        opinions: profile.opinions.map((o) => o.belief),
        territories: profile.territories ?? [],
        role: profile.role,
      },
      sourceMaterial: 'PostgreSQL Supabase Meilisearch Next.js integration',
      platform: 'linkedin',
    })

    const codes = result.failures.map((f) => f.code)
    expect(codes).toContain('MALFORMED_SOURCE_HANDLING')
  })
})

describe('Quality Gate: Spelling Handling', () => {
  const profile = makeProfile()

  it('does NOT flag legitimate technical vocabulary as garbled', () => {
    const technicalPost = `PostgreSQL and Supabase provide a solid foundation for Next.js applications.
When combined with Meilisearch, you get fast full-text search out of the box.

The key insight: use Web3 authentication patterns sparingly. Solana and Spree integrations work best when you keep the architecture clean.

LongCat models handle the inference layer efficiently.`

    const result = evaluatePostQuality({
      caption: technicalPost,
      personaContext: {
        expertise: profile.expertise.map((e) => e.area),
        audiences: profile.audiences ?? [],
        goals: profile.contentGoals ?? [],
        projects: profile.projects.map((p) => p.name),
        opinions: profile.opinions.map((o) => o.belief),
        territories: profile.territories ?? [],
        role: profile.role,
      },
      sourceMaterial: 'PostgreSQL Supabase Meilisearch Next.js Web3 Solana Spree LongCat',
      platform: 'linkedin',
    })

    const codes = result.failures.map((f) => f.code)
    expect(codes).not.toContain('MALFORMED_SOURCE_HANDLING')
  })
})

describe('PostPlan: Core Insight Validation', () => {
  it('validates strong insight as substantive', () => {
    const result = validateCoreInsight(
      'AI coding tools reduce implementation time faster than review time, so the bottleneck moves from writing code to validating decisions'
    )
    expect(result.valid).toBe(true)
  })

  it('rejects generic motivational insight', () => {
    const result = validateCoreInsight('Keeping things simple helps teams make progress')
    expect(result.valid).toBe(false)
  })

  it('rejects vague "communication is important"', () => {
    const result = validateCoreInsight('Communication is important when building software')
    expect(result.valid).toBe(false)
  })

  it('rejects cliché "AI is changing how we work"', () => {
    const result = validateCoreInsight('AI is changing how we work')
    expect(result.valid).toBe(false)
  })
})

describe('PostPlan: Build Plan', () => {
  it('builds plan with allowed claims from profile', () => {
    const profile = makeProfile()
    const idea = makeIdea()
    const plan = buildPostPlan({
      idea,
      profile,
      journey: [],
      platform: 'linkedin',
    })

    expect(plan.allowedPersonalClaims.length).toBeGreaterThan(0)
    expect(plan.allowedPersonalClaims.some((c) => c.includes('Rails'))).toBe(true)
    expect(plan.forbiddenClaims.length).toBeGreaterThan(0)
    expect(plan.coreInsight.length).toBeGreaterThan(0)
    expect(plan.groundingMode).toBeDefined()
  })

  it('builds plan for non-technical persona', () => {
    const profile = makeProfile({
      role: 'Founder',
      expertise: [
        { area: 'Company Building', level: 'advanced', evidence: '', updatedAt: '' },
      ],
      territories: ['Company Building', 'Leadership'],
    })
    const idea = makeIdea({
      title: 'Most early startups over-engineer before product-market fit',
      angle: 'Every hour on microservices abstraction is an hour not talking to customers',
      sourceKind: 'opinion',
    })
    const plan = buildPostPlan({
      idea,
      profile,
      journey: [],
      platform: 'linkedin',
    })

    expect(plan.groundingMode).toBe('CONFIRMED_OPINION')
    expect(plan.allowedPersonalClaims.length).toBeGreaterThan(0)
  })

  it('builds plan for X platform with short insight structure', () => {
    const profile = makeProfile()
    const idea = makeIdea({ territory: 'conversation' })
    const plan = buildPostPlan({
      idea,
      profile,
      journey: [],
      platform: 'x',
    })

    expect(plan.structure).toBe('observation')
  })
})
