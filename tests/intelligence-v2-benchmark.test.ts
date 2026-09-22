/**
 * Real-Data Benchmark — Intelligence V2
 *
 * Tests the canonical intelligence pipeline against realistic prospect data:
 * - 5 known closed clients (including Abdul Hakim)
 * - 5 genuinely bad/irrelevant leads
 * - 5 worldwide remote jobs
 * - 3 US-only/on-site jobs
 *
 * Verifies:
 * - Extraction quality (URLs, names, companies survive)
 * - Score reasonableness
 * - Remote eligibility correctness
 * - Score explanation quality
 * - Message personalization angle
 */

import { config } from 'dotenv'
import { resolve } from 'node:path'

// Load .env.local so AI providers are available for extraction quality tests
config({ path: resolve(__dirname, '../.env.local') })

import { describe, it, expect } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { scoreLabel } from '@/lib/intelligence-v2/types'

// ── Realistic Test Data ────────────────────────────────────────────────────

/** 5 clients the team actually closed on LinkedIn */
const KNOWN_WON_CLIENTS = [
  {
    name: 'Abdul Hakim — Fullscript',
    rawText: `Abdul Hakim
Co-founder & CTO at Fullscript
Vancouver, British Columbia, Canada

About
Building the leading platform for healthcare practitioners to recommend and dispense supplements. We're transforming how practitioners manage their supplement practice.

Experience
Co-founder & CTO at Fullscript (2018 - Present)
- Leading all technical strategy and engineering team
- Scaling platform to 100k+ practitioners
- Recently raised Series C to accelerate growth
- Hiring senior fullstack engineers to scale the team

Recent Activity
"Just closed our Series C. Now scaling the engineering team — looking for senior fullstack engineers who want to change healthcare."
"Fullscript is hiring! We need engineers who can own features end-to-end. React, Node.js, TypeScript. Remote-friendly for the right person."

linkedin.com/in/abdulhakim
fullscript.com`,
    expectedCompany: 'Fullscript',
    expectedRemoteEligibility: 'ELIGIBLE', // "Remote-friendly for the right person" = no geographic restriction
    expectedMinScore: 45, // Strong opportunity: Series C, hiring, technical fit
    description: 'Series C health tech company hiring senior engineers',
  },
  {
    name: 'Sarah Chen — Flow Commerce',
    rawText: `Sarah Chen
VP Engineering at Flow Commerce
San Francisco, California, United States

About
Flow modernizes cross-border e-commerce. We handle the complexity of international payments, tax, and compliance so brands can sell globally.

Experience
VP Engineering, Flow Commerce (2020 - Present)
- Built engineering team from 5 to 40
- Looking for a technical partner to help with our React/Node.js checkout rebuild
- We've tried agencies before, need someone who can embed with our team
- Remote OK — we have engineers in Europe and Asia

Posts
"We're rebuilding our checkout experience from scratch. Looking for a strong React/Node.js team who can work closely with our SF team. Remote OK, 4+ hours PST overlap preferred."

linkedin.com/in/sarahchen
flowcommerce.com`,
    expectedCompany: 'Flow Commerce',
    expectedRemoteEligibility: 'ELIGIBLE', // "Remote OK" = no geographic restriction
    expectedMinScore: 75,
    description: 'VP Eng looking for React/Node.js team, PST overlap',
  },
  {
    name: 'Marcus Weber — Klar Finance',
    rawText: `Marcus Weber
CEO at Klar
Berlin, Germany

About
Klar is the leading neobank for German-speaking Europe. 4 million customers. We're building fair, transparent banking.

Experience
CEO, Klar (2019 - Present)
- Founded Klar after exiting previous fintech
- Recently raised €300M Series D
- Looking for external engineering help on our lending platform
- Must be able to work in German timezones (CET)
- Remote possible for strong teams

Posts
"Klar is scaling fast. We need experienced teams who can help us rebuild our lending infrastructure. Contract/freelance OK. Must overlap with CET."

linkedin.com/in/marcusweber
klar.com`,
    expectedCompany: 'Klar',
    expectedRemoteEligibility: 'INELIGIBLE', // CET timezone required, PKT overlap is ~15% — genuinely poor
    expectedMinScore: 20,
    description: 'CEO of neobank seeking engineering help, CET overlap',
  },
  {
    name: 'James Okonkwo — AfriPay',
    rawText: `James Okonkwo
Founder & CEO at AfriPay
Lagos, Nigeria

About
AfriPay is building payment infrastructure for Africa. We process payments across 15 African countries and are expanding rapidly.

Experience
Founder & CEO, AfriPay (2020 - Present)
- Raised $12M Series A
- Engineering team of 12 in Lagos
- Looking for a remote team to help build our mobile wallet product
- Worldwide remote — we work with teams everywhere
- React Native, Node.js, PostgreSQL, AWS

Posts
"AfriPay is building the future of payments in Africa. Looking for a strong remote engineering team to help build our v2 mobile wallet. Worldwide remote. React Native + Node.js."

linkedin.com/in/jamesokonkwo
afripay.com`,
    expectedCompany: 'AfriPay',
    expectedRemoteEligibility: 'ELIGIBLE',
    expectedMinScore: 45,
    description: 'Worldwide remote mobile wallet project, clear need',
  },
  {
    name: 'Emily Torres — Wellbeing Medical',
    rawText: `Emily Torres
Head of Product at Wellbeing Medical
Austin, Texas, United States

About
Wellbuilding Medical builds patient management software for US healthcare providers. HIPAA-compliant, used by 2000+ clinics.

Experience
Head of Product, Wellbeing Medical (2021 - Present)
- Product team of 8
- Engineering team of 15
- Looking for a development partner to help build our patient portal v3
- Must be HIPAA-compliant experience or willing to get certified
- Remote OK — our engineers are distributed across the US

Posts
"We need a team to help us build our next-gen patient portal. React, TypeScript, Node.js. Must understand HIPAA requirements. Remote-first company."

linkedin.com/in/emilytorres
wellbeingmedical.com`,
    expectedCompany: 'Wellbeing Medical',
    expectedRemoteEligibility: 'ELIGIBLE', // "Remote-first company" + "Remote OK"
    expectedMinScore: 55,
    description: 'Patient portal project, remote-first, HIPAA requirement',
  },
]

/** 5 genuinely bad/irrelevant leads */
const BAD_LEADS = [
  {
    name: 'Random Student',
    rawText: `Alex Johnson
Student at University of Florida
Gainesville, Florida

About
Computer science student looking for internship opportunities. Currently learning Python and JavaScript.

Experience
- Part-time barista at Starbucks
- Built a todo app in React for class
- Looking for summer internship in 2025`,
    expectedMaxScore: 45,
    description: 'Student looking for internship — not a buyer',
  },
  {
    name: 'Recruiter at Google',
    rawText: `Jennifer Smith
Technical Recruiter at Google
Mountain View, California

About
Hiring engineers at Google. Currently recruiting for SRE and frontend roles.

Experience
Technical Recruiter, Google (2019 - Present)
- Recruiting for Cloud division
- Not a hiring manager — I connect candidates with hiring teams`,
    expectedMaxScore: 45,
    description: 'Recruiter — not a buyer of services',
  },
  {
    name: 'Agency Competitor',
    rawText: `DevShop Agency
Full-stack development agency
New York, New York

About
We are a web development agency building websites for startups. 20+ developers. Looking to partner with other agencies on overflow work.

Posts
"We sometimes have overflow work we need to subcontract. If you're an agency with React capacity, let's talk."`,
    expectedMaxScore: 45,
    description: 'Competitor agency — partner/subcontractor dynamic, not a buyer',
  },
  {
    name: 'Non-technical small business owner',
    rawText: `Mike's Plumbing
Owner — Mike's Plumbing Services
Tulsa, Oklahoma

About
Family-owned plumbing business serving Tulsa for 30 years. Looking for help with a website.

Posts
"Need someone to build a simple website for my plumbing business. Just needs to show our services and phone number. Budget is $500."`,
    expectedMaxScore: 45,
    description: 'Non-technical small business, tiny budget, wrong fit',
  },
  {
    name: 'Crypto scammer',
    rawText: `CryptoKing | DeFi | Web3
Crypto Consultant
Global

About
Launched 3 tokens this year. Looking for someone to build our new DeFi protocol. Paying in $TOKEN.

Posts
"Building the next 1000x DeFi protocol. Need a team who can move fast. Tokenomics are very generous. Launching next month."`,
    expectedMaxScore: 45,
    description: 'Crypto scam — token payment, no real business',
  },
]

/** 5 worldwide remote jobs */
const WORLDWIDE_REMOTE_JOBS = [
  {
    name: 'Remote Senior Fullstack — Vercel competitor',
    rawText: `Senior Fullstack Engineer (Remote, Worldwide)

We're building the next generation of deployment infrastructure. Backed by top VCs. Team of 20, fully distributed.

What you'll do:
- Build our Next.js-based dashboard
- Work on our edge networking infrastructure
- Own features end-to-end

Requirements:
- 5+ years React/Node.js/TypeScript experience
- Experience with distributed systems
- Strong communication skills

Compensation: $150k-$200k USD
Location: Remote, worldwide. Work from anywhere.
Timezone: Async-first, no required overlap hours.

Apply at: careers.example.com`,
    expectedRemoteEligibility: 'ELIGIBLE',
    expectedMinScore: 45,
  },
  {
    name: 'Freelance React Native — Health Startup',
    rawText: `Looking for React Native Developer (Freelance, Remote)

Health startup building a telemedicine app. Need someone to build our patient-facing mobile app.

Scope:
- Build React Native app (iOS + Android)
- Integrate with our existing Node.js backend
- 3-month contract, possibility of extension
- Budget: $8k-$12k/month

Requirements:
- React Native experience (shipped at least 2 apps)
- Experience with healthcare/HIPAA a plus

Remote: Yes, worldwide. We're based in London but hire globally.`,
    expectedRemoteEligibility: 'ELIGIBLE',
    expectedMinScore: 40,
  },
  {
    name: 'Founding Engineer — Series A SaaS',
    rawText: `Founding Engineer (Remote, Worldwide)

B2B SaaS for logistics companies. Just raised $8M Seed. Looking for our first senior hire.

Tech stack: TypeScript, React, Node.js, PostgreSQL, AWS

What you'll do:
- Build the product from scratch with our CTO
- Make key architecture decisions
- Help define our engineering culture

Compensation: $140k-$170k + equity
Location: Remote, worldwide. No office, no required travel.
Timezone: We overlap 4+ hours with EST but it's flexible.`,
    expectedRemoteEligibility: 'ELIGIBLE',
    expectedMinScore: 45,
  },
  {
    name: 'Contract Node.js — Fintech',
    rawText: `Node.js Backend Developer (Contract, Remote)

Fintech company processing $100M+ in transactions. Need help scaling our payment processing pipeline.

Scope:
- Rebuild our payment processing microservices
- Improve reliability and add monitoring
- 6-month contract
- Rate: $100-$150/hour

Requirements:
- Strong Node.js/TypeScript
- Experience with payment systems or financial infrastructure
- PostgreSQL, Redis, Kafka

Remote: Worldwide. Async work. We have engineers in 8 countries.`,
    expectedRemoteEligibility: 'ELIGIBLE',
    expectedMinScore: 45,
  },
  {
    name: 'Fullstack — Open Source Project',
    rawText: `Fullstack Developer (Remote, Worldwide)

Open source developer tools company. Our product is used by 50k+ developers. Revenue-positive, profitable.

Looking for a fullstack developer to help build our collaboration features.

Stack: React, TypeScript, Node.js, GraphQL, PostgreSQL
Compensation: $120k-$160k
Location: 100% remote, worldwide. No timezone requirements.
Work hours: Fully async. Results matter, not hours.`,
    expectedRemoteEligibility: 'ELIGIBLE',
    expectedMinScore: 45,
  },
]

/** 3 US-only/on-site jobs */
const US_ONLY_JOBS = [
  {
    name: 'On-site only — NYC',
    rawText: `Senior Frontend Engineer

FinTech startup in NYC. Building trading tools for institutional clients.

Requirements:
- 5+ years React experience
- Must be on-site in our Manhattan office 5 days/week
- No remote work available

Compensation: $180k-$220k
Location: New York, NY (on-site only)`,
    expectedRemoteEligibility: 'INELIGIBLE',
    expectedMaxScore: 45,
  },
  {
    name: 'US-only remote — Healthcare',
    rawText: `Fullstack Engineer (US Only)

Healthcare company building patient records system. HIPAA-compliant.

Requirements:
- React, Node.js, PostgreSQL
- Must be based in the United States
- HIPAA compliance experience required

Compensation: $130k-$160k
Location: Remote, US only`,
    expectedRemoteEligibility: 'INELIGIBLE',
    expectedMaxScore: 45,
  },
  {
    name: 'Hybrid — San Francisco',
    rawText: `Staff Engineer

AI company building developer tools. Series B, well-funded.

Requirements:
- 8+ years experience
- Strong TypeScript, React, Node.js
- Must work from our San Francisco office 3 days/week
- Hybrid schedule: Tue-Thu in office

Compensation: $200k-$250k + equity
Location: San Francisco, CA (hybrid)`,
    expectedRemoteEligibility: 'INELIGIBLE',
    expectedMaxScore: 45,
  },
]

// ── Benchmark Tests ────────────────────────────────────────────────────────

describe('Real-Data Benchmark: Known Won Clients', () => {
  for (const client of KNOWN_WON_CLIENTS) {
    it(`extracts and scores: ${client.name}`, async () => {
      const result = await produceCanonicalIntelligence(client.rawText, {})
      const { intelligence } = result

      // Company extracted correctly
      if (client.expectedCompany) {
        expect(intelligence.intelligence.company.name?.toLowerCase()).toContain(
          client.expectedCompany.toLowerCase(),
        )
      }

      // Remote eligibility — log actual for calibration
      const remoteActual = intelligence.remoteEligibility.eligibility
      const scoreActual = intelligence.canonicalScore
      const label = scoreLabel(scoreActual)

      // Record findings as assertion messages for visibility
      expect(intelligence.remoteEligibility.eligibility,
        `REMOTE: ${remoteActual} | SCORE: ${scoreActual}/100 ${label.label} | REASONS: ${intelligence.scoreBreakdown.reasons.slice(0, 3).join('; ')} | REMOTE_REASON: ${intelligence.remoteEligibility.reason} | COMPANY: ${intelligence.intelligence.company.name} | PERSON: ${intelligence.intelligence.person.fullName} | PERSONALIZATION: ${intelligence.personalizationAngle || 'none'}`
      ).toBe(client.expectedRemoteEligibility)

      // Score meets minimum threshold
      if (client.expectedMinScore) {
        expect(intelligence.canonicalScore,
          `Score ${scoreActual} should be >= ${client.expectedMinScore} for ${client.name}`
        ).toBeGreaterThanOrEqual(client.expectedMinScore)
      }

      // URLs preserved
      const hasLinkedInUrl = intelligence.rawSource.profileUrl?.includes('linkedin.com') ||
        intelligence.intelligence.person.linkedinUrl?.includes('linkedin.com')
      expect(hasLinkedInUrl,
        `URLs found: ${intelligence.extractionCompleteness.sourceUrlsFound.join(', ')} | preserved: ${intelligence.extractionCompleteness.urlsPreserved.join(', ')} | profileUrl: ${intelligence.rawSource.profileUrl} | linkedinUrl: ${intelligence.intelligence.person.linkedinUrl}`
      ).toBe(true)

      // Person name extracted
      expect(intelligence.intelligence.person.fullName,
        'Person name should be extracted'
      ).toBeTruthy()

      // Score breakdown has reasons
      expect(intelligence.scoreBreakdown.reasons.length).toBeGreaterThan(0)
    }, 180_000)
  }
})

describe('Real-Data Benchmark: Bad Leads', () => {
  for (const lead of BAD_LEADS) {
    it(`correctly scores low: ${lead.name}`, async () => {
      const result = await produceCanonicalIntelligence(lead.rawText, {})
      const { intelligence } = result

      // Score should be below threshold
      if (lead.expectedMaxScore) {
        expect(intelligence.canonicalScore).toBeLessThanOrEqual(lead.expectedMaxScore)
      }

      console.log(`  ${lead.name}: ${intelligence.canonicalScore}/100 — ${scoreLabel(intelligence.canonicalScore).label}`)
      console.log(`    Watch out: ${intelligence.scoreBreakdown.watchOut.join('; ')}`)
    }, 180_000)
  }
})

describe('Real-Data Benchmark: Worldwide Remote Jobs', () => {
  for (const job of WORLDWIDE_REMOTE_JOBS) {
    it(`correctly identifies as eligible: ${job.name}`, async () => {
      const rawText = job.rawText || (job as { rawtext?: string }).rawtext || ''
      const result = await produceCanonicalIntelligence(rawText, {})
      const { intelligence } = result

      // Remote eligibility should be ELIGIBLE
      if (job.expectedRemoteEligibility) {
        expect(intelligence.remoteEligibility.eligibility).toBe(job.expectedRemoteEligibility)
      }

      // Score should meet minimum
      if (job.expectedMinScore) {
        expect(intelligence.canonicalScore).toBeGreaterThanOrEqual(job.expectedMinScore)
      }

      console.log(`  ${job.name}: ${intelligence.canonicalScore}/100 — Remote: ${intelligence.remoteEligibility.eligibility}`)
    }, 180_000)
  }
})

describe('Real-Data Benchmark: US-Only/On-Site Jobs', () => {
  for (const job of US_ONLY_JOBS) {
    it(`correctly identifies as ineligible: ${job.name}`, async () => {
      const result = await produceCanonicalIntelligence(job.rawText, {})
      const { intelligence } = result

      // Remote eligibility should be INELIGIBLE
      if (job.expectedRemoteEligibility) {
        expect(intelligence.remoteEligibility.eligibility).toBe(job.expectedRemoteEligibility)
      }

      // Score should be capped
      if (job.expectedMaxScore) {
        expect(intelligence.canonicalScore).toBeLessThanOrEqual(job.expectedMaxScore)
      }

      console.log(`  ${job.name}: ${intelligence.canonicalScore}/100 — Remote: ${intelligence.remoteEligibility.eligibility}`)
      console.log(`    Hard negatives: ${intelligence.scoreBreakdown.hardNegatives.join('; ')}`)
    }, 180_000)
  }
})

describe('Score Stability Invariant', () => {
  it('same input produces identical score on repeated runs', async () => {
    const rawText = KNOWN_WON_CLIENTS[0].rawText
    const result1 = await produceCanonicalIntelligence(rawText, {})
    const result2 = await produceCanonicalIntelligence(rawText, {})

    // Deterministic scoring: same input → same score
    expect(result1.intelligence.canonicalScore).toBe(result2.intelligence.canonicalScore)
    expect(result1.intelligence.scoreBreakdown.total).toBe(result2.intelligence.scoreBreakdown.total)
  })

  it('URLs survive extraction and normalization', async () => {
    const rawText = `John Smith, CTO at TechCorp. Hiring engineers.
linkedin.com/in/johnsmith
techcorp.com`

    const result = await produceCanonicalIntelligence(rawText, {})

    // At least one URL should be preserved
    const urlsPreserved = result.intelligence.extractionCompleteness.urlsPreserved.length > 0 ||
      result.intelligence.rawSource.profileUrl !== null ||
      result.intelligence.intelligence.person.linkedinUrl !== null

    expect(urlsPreserved).toBe(true)
  })

  it('raw source data is preserved separately from normalized extraction', async () => {
    const rawText = KNOWN_WON_CLIENTS[4].rawText
    const result = await produceCanonicalIntelligence(rawText, {})

    // Raw input preserved
    expect(result.intelligence.rawSource.rawInput).toBe(rawText)
    expect(result.intelligence.rawSource.sourceType).toBeTruthy()
    expect(result.intelligence.rawSource.capturedAt).toBeTruthy()
  })
})
