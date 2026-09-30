/**
 * Adversarial Fixtures — V3
 *
 * Test cases that expose the architectural failures of V2.
 * No regex tailored to fixture strings. These test the SYSTEM behavior.
 *
 * Categories:
 * - MULTI_ROLE_SERVICE_PROVIDER_WITH_EXPLICIT_BUYER_EVENT
 * - SERVICE_PROVIDER_WITH_HIRING
 * - MULTI_ORGANIZATION_SCOPING
 * - EXPIRED_VS_CURRENT
 * - CONTRADICTORY_EVIDENCE
 * - WEAK_EVIDENCE
 * - MARKET_COMMENTARY_MISREAD
 */

export interface V3TestFixture {
  id: string
  category: string
  description: string
  /** Raw input text (synthetic) */
  rawText: string
  /** Expected V3 behavior */
  expectations: {
    /** Minimum expected score for the best episode */
    minScore?: number
    /** Maximum expected score */
    maxScore?: number
    /** Expected qualification */
    qualification?: 'STRONG' | 'WORTH_PURSUING' | 'MAYBE' | 'SKIP' | 'INELIGIBLE'
    /** Expected action */
    action?: 'CONTACT_NOW' | 'CONNECT_WITH_NOTE' | 'CONNECT_WITHOUT_NOTE' | 'OBSERVE' | 'WAIT' | 'SKIP'
    /** Must NOT be skipped purely because of identity */
    mustNotBeIdentityZero?: boolean
    /** Buyer request should be detected */
    buyerRequestDetected?: boolean
    /** Service provider should not suppress buyer signal */
    buyerSignalNotSuppressed?: boolean
    /** Minimum episode count */
    minEpisodes?: number
  }
}

// ── MULTI_ROLE: Service Provider + Explicit Buyer Event ─────────────────────

export const MULTI_ROLE_SERVICE_PROVIDER_BUYER: V3TestFixture = {
  id: 'multi_role_service_provider_buyer',
  category: 'MULTI_ROLE_SERVICE_PROVIDER_WITH_EXPLICIT_BUYER_EVENT',
  description: 'Person runs a software agency but their other company explicitly requested a developer with direct apply instructions. V2 zeros this because SERVICE_PROVIDER globally suppresses. V3 should score the hiring episode independently.',
  rawText: `Alex Morgan
Founder at DevPulse Agency | Co-founder at HealthBridge

About
I run DevPulse, a software agency that helps startups build MVPs. We provide full-stack development services to early-stage companies.

Experience
Founder, DevPulse Agency (2020 - Present)
- Provide React/Node.js development services
- Help companies build and scale their products
- Coaching clients through technical decisions

Co-founder, HealthBridge (2023 - Present)
- Building a healthcare data platform
- Recently closed pre-seed round

Posts (3 months ago)
"HealthBridge is hiring a senior full-stack developer. Must know React, Node.js, TypeScript. Send your resume and GitHub to careers@healthbridge.io or DM me directly. Remote-friendly."

linkedin.com/in/alexmorgan`,
  expectations: {
    minScore: 30,  // Should NOT be zero just because they run an agency
    qualification: 'MAYBE',
    action: 'OBSERVE',  // Aging (3 months) but explicit request
    mustNotBeIdentityZero: true,
    buyerRequestDetected: true,
    buyerSignalNotSuppressed: true,
    minEpisodes: 2,  // Service offering episode + hiring episode
  },
}

// ── SERVICE PROVIDER + HIRING ────────────────────────────────────────────────

export const AGENCY_OUTSOURCING: V3TestFixture = {
  id: 'agency_outsourcing_request',
  category: 'AGENCY_WITH_OUTSOURCING_REQUEST',
  description: 'An agency that provides services is also looking to outsource overflow work. V2 sees SERVICE_PROVIDER and ignores the outsourcing need. V3 should detect the outsourcing episode.',
  rawText: `Jordan Blake
CEO at PixelForge Studios

About
PixelForge is a design and development studio. We craft digital experiences for brands worldwide. Our team of 15 handles everything from branding to full-stack development.

Posts
"Due to overwhelming demand, we're looking for a reliable development partner to handle overflow React/Node.js work. Must be able to embed with our process. Reach out to jordan@pixelforge.studio if interested."

linkedin.com/in/jordanblake`,
  expectations: {
    minScore: 25,
    qualification: 'MAYBE',
    mustNotBeIdentityZero: true,
    buyerSignalNotSuppressed: true,
  },
}

// ── FOUNDER + JOB SEEKING ───────────────────────────────────────────────────

export const FOUNDER_JOB_SEEKING: V3TestFixture = {
  id: 'founder_job_seeking',
  category: 'FOUNDER_WITH_JOB_SEEKING',
  description: 'A founder who is also open to employment. V2 conflates job-seeking with non-buyer. V3 should treat these as separate episodes.',
  rawText: `Sam Rivera
Founder at CloudScale AI | Open to new opportunities

About
Building CloudScale AI — infrastructure for ML teams. Previously founded DataMesh (acquired 2023).

Experience
Founder, CloudScale AI (2024 - Present)
- Building infrastructure platform for ML engineering teams
- Raised seed round

Posts
"After exiting DataMesh, I'm exploring my next role. Open to senior engineering positions or CTO roles at growth-stage companies. Particularly interested in AI/ML infrastructure. DM me or email sam@rivera.dev"

linkedn.com/in/samrivera`,
  expectations: {
    minEpisodes: 2,
    // The "open to work" episode should not create buyer signal
    // The CloudScale AI episode might be a buyer if it shows hiring/growth
  },
}

// ── MULTI-ORGANIZATION SCOPING ──────────────────────────────────────────────

export const MULTI_ORG_SCOPING: V3TestFixture = {
  id: 'multi_organization_scoping',
  category: 'SAME_PERSON_MULTIPLE_ORGANIZATIONS',
  description: 'Person has three different organizations. A hiring post from Org A must not be interpreted as an Org B opportunity. V2 mixes context across orgs.',
  rawText: `Taylor Kim
CEO at NovaTech | Advisor at GreenLeaf | Founder at EduFlow

About
Building the future of work across multiple ventures.

Experience
CEO, NovaTech (2022 - Present)
- B2B SaaS platform for logistics
- 20 employees, Series A

Advisor, GreenLeaf (2023 - Present)
- Sustainable agriculture nonprofit

Founder, EduFlow (2024 - Present)
- AI-powered education platform
- Just launched beta

Posts (1 month ago)
"NovaTech is hiring! Looking for a senior backend engineer (Python, AWS, PostgreSQL). Remote-first team. Apply at novatech.careers.io"

Posts (2 weeks ago)
"EduFlow just hit 1,000 beta users! Building something special in ed-tech."

linkedin.com/in/taylorkim`,
  expectations: {
    minEpisodes: 2,  // At least NovaTech (hiring) and EduFlow (launch)
    buyerRequestDetected: true,
    minScore: 40,  // NovaTech hiring should score well
  },
}

// ── EXPIRED HIRING POST ─────────────────────────────────────────────────────

export const EXPIRED_HIRING_POST: V3TestFixture = {
  id: 'expired_hiring_post',
  category: 'EXPIRED_VS_CURRENT',
  description: 'A strong explicit hiring request from 6 months ago should have reduced current score due to staleness, not zero intent. V2 either zeros it or ignores staleness.',
  rawText: `Morgan Chen
CTO at DataMesh

About
Leading engineering at DataMesh — real-time data processing platform.

Posts (6 months ago)
"DataMesh is hiring a full-stack developer! React, Node.js, TypeScript, PostgreSQL. Send your resume, GitHub, and availability to careers@datamesh.io. Remote OK."

Posts (1 week ago)
"Shipped our v2 platform rewrite. Performance improved 10x."

linkedin.com/in/morganchen`,
  expectations: {
    // Intent is strong but timing is stale
    // Score should reflect: high intent + stale timing = moderate/aging
    maxScore: 65,  // Stale timing should reduce score
    minScore: 20,  // But not zero — intent was real
    buyerRequestDetected: true,
  },
}

// ── CURRENT DIRECT APPLY ────────────────────────────────────────────────────

export const CURRENT_DIRECT_APPLY: V3TestFixture = {
  id: 'current_direct_apply_instruction',
  category: 'CURRENT_DIRECT_APPLY',
  description: 'A current post with explicit apply instructions should score high on buyer request and timing.',
  rawText: `Casey Park
VP Engineering at StreamLine

About
Building StreamLine — the next generation of video streaming infrastructure.

Posts (2 days ago)
"We're hiring a senior full-stack engineer at StreamLine. React, Node.js, TypeScript, AWS. If interested, send your resume and GitHub to casey@streamline.tv or DM me. Remote-friendly for the right person."

linkedin.com/in/caseypark`,
  expectations: {
    minScore: 55,
    qualification: 'WORTH_PURSUING',
    buyerRequestDetected: true,
  },
}

// ── CUSTOMER NEED MISREAD AS SELF NEED ──────────────────────────────────────

export const CUSTOMER_NEED_MISREAD: V3TestFixture = {
  id: 'customer_need_misread',
  category: 'CUSTOMER_NEED_NOT_SELF_NEED',
  description: 'Person describes their customers\' problem. V2 sometimes misreads this as self-need. V3 should classify as CUSTOMER_NEED with lower buyer relevance.',
  rawText: `Riley Santos
Founder at SupportBot AI

About
We build AI-powered customer support tools. Our clients struggle with response times and ticket volume — that's why they use our platform.

Experience
Founder, SupportBot AI (2023 - Present)
- Building AI agents for customer support
- Our customers see 40% reduction in response time
- Raised pre-seed, team of 5

linkedin.com/in/rileysantos`,
  expectations: {
    // Customer need should NOT be scored as strongly as self-need
    maxScore: 50,
    qualification: 'MAYBE',
  },
}

// ── MARKET COMMENTARY MISREAD AS BUYER NEED ─────────────────────────────────

export const MARKET_COMMENTARY: V3TestFixture = {
  id: 'market_commentary_misread',
  category: 'MARKET_COMMENTARY_NOT_BUYER',
  description: 'Person comments on industry trends. V2 sometimes treats market commentary as buyer signal. V3 should classify as MARKET_COMMENTARY with low buyer relevance.',
  rawText: `Quinn Lee
Industry Analyst | Tech Commentary

About
Tracking the future of software development. 15 years in tech, now analyzing trends.

Posts
"The demand for full-stack developers has increased 40% year-over-year. Companies struggle to find React/Node.js talent. The market is shifting toward AI-assisted development tools. Remote work continues to reshape hiring."

Posts (1 week ago)
"Interesting trend: more agencies are offering embedded team models rather than project-based work."

linkedin.com/in/quinnlee`,
  expectations: {
    maxScore: 25,  // Market commentary ≠ buyer
    qualification: 'SKIP',
  },
}

// ── CONTRADICTORY POSTS ───────────────────────────────────────────────────

export const CONTRADICTORY_POSTS: V3TestFixture = {
  id: 'contradictory_posts',
  category: 'CONTRADICTORY_EVIDENCE',
  description: 'Person has contradictory signals — one post says hiring, another says hiring freeze. V3 should detect both and weight recent/active one higher.',
  rawText: `Drew Mitchell
CTO at AppForge

About
Leading engineering at AppForge — mobile app development platform.

Posts (1 month ago)
"AppForge is hiring! Looking for a React Native developer. Send your portfolio to jobs@appforge.dev."

Posts (3 weeks ago)
"Update: We've paused hiring for now. The role has been filled internally."

linkedin.com/in/drewmitchell`,
  expectations: {
    // Contradictory — hiring signal was negated
    maxScore: 40,
  },
}

// ── WEAK EVIDENCE ───────────────────────────────────────────────────────────

export const WEAK_EVIDENCE: V3TestFixture = {
  id: 'weak_evidence',
  category: 'WEAK_EVIDENCE',
  description: 'Minimal information — name and title only. V3 should not fabricate intent.',
  rawText: `Jordan Smith
Software Engineer

About
Engineer at a tech company.

linkedin.com/in/jordansmith`,
  expectations: {
    maxScore: 15,
    qualification: 'SKIP',
  },
}

// ── FOREIGN LANGUAGE EVIDENCE ──────────────────────────────────────────────

export const FOREIGN_LANGUAGE: V3TestFixture = {
  id: 'foreign_language_evidence',
  category: 'FOREIGN_LANGUAGE',
  description: 'Profile in a non-English language. V3 should not crash or misinterpret.',
  rawText: `محمد أحمد
مدير تقنية المعلومات في شركة نيكسا للبرمجيات

حول
أقود فريق الهندسة في نيكسا. نبني منصات للرعاية الصحية.

المشاريع
- منصة إدارة المرضى
- نظام المواعيد الطبية`,
  expectations: {
    // Should handle gracefully without crashing
    maxScore: 50,  // May or may not detect intent
  },
}

// ── TECHNICAL FOUNDER + NO NEED ─────────────────────────────────────────────

export const TECHNICAL_FOUNDER_NO_NEED: V3TestFixture = {
  id: 'technical_founder_no_need',
  category: 'TECHNICAL_FOUNDER_NO_NEED',
  description: 'Technical founder building a product but no indication of needing outside help. V2 sometimes infers need from technical language. V3 should not.',
  rawText: `Alex Turner
Founder & CTO at CodePilot

About
Building CodePilot — an AI pair-programming tool. Full-stack: React, TypeScript, Node.js, PostgreSQL, AWS. We're a team of 3 engineers shipping fast.

Experience
Founder, CodePilot (2024 - Present)
- Building the core product solo before this
- Now have 2 engineers
- Self-funded, profitable from month 3

Posts (2 weeks ago)
"Just shipped our real-time collaboration feature. Tech stack choices paying off."

linkedin.com/in/alexnturner`,
  expectations: {
    maxScore: 35,  // No explicit need signal
    qualification: 'SKIP',
  },
}

// ── Explicit Freelance Request ───────────────────────────────────────────────

export const EXPLICIT_FREELANCE: V3TestFixture = {
  id: 'explicit_freelance_request',
  category: 'EXPLICIT_FREELANCE_REQUEST',
  description: 'Direct request for freelance development help.',
  rawText: `Morgan Lee
Founder at BudgetWise

About
Building BudgetWise — personal finance app for Gen Z.

Posts (3 days ago)
"Looking for a freelance React/Node.js developer to help build our MVP. Budget is $5-8k. Need someone who can start this week. DM me with examples of similar work."

linkedin.com/in/morganlee`,
  expectations: {
    minScore: 45,
    qualification: 'WORTH_PURSUING',
    buyerRequestDetected: true,
  },
}

// ── Old Role vs Current Role ─────────────────────────────────────────────────

export const OLD_ROLE_VS_CURRENT: V3TestFixture = {
  id: 'old_role_vs_current',
  category: 'ROLE_TRANSITION',
  description: 'Person changed roles. Old role signals should not count as current opportunity.',
  rawText: `Sam Okafor
Senior Product Manager at MetaScale

About
Leading product at MetaScale — enterprise data analytics.

Experience
Senior PM, MetaScale (2024 - Present)

Previous
VP Engineering, StartupXYZ (2020 - 2024)
- Built engineering team from 2 to 20
- Hired 15+ engineers
- Scaled platform to 1M users

Posts (1 week ago)
"Excited to start my new product role at MetaScale!"

linkedin.com/in/samokafor`,
  expectations: {
    // Previous hiring signals should NOT count
    maxScore: 30,
    qualification: 'SKIP',
  },
}

// ── All Fixtures ─────────────────────────────────────────────────────────────

export const ALL_ADVERSARIAL_FIXTURES: V3TestFixture[] = [
  MULTI_ROLE_SERVICE_PROVIDER_BUYER,
  AGENCY_OUTSOURCING,
  FOUNDER_JOB_SEEKING,
  MULTI_ORG_SCOPING,
  EXPIRED_HIRING_POST,
  CURRENT_DIRECT_APPLY,
  CUSTOMER_NEED_MISREAD,
  MARKET_COMMENTARY,
  CONTRADICTORY_POSTS,
  WEAK_EVIDENCE,
  FOREIGN_LANGUAGE,
  TECHNICAL_FOUNDER_NO_NEED,
  EXPLICIT_FREELANCE,
  OLD_ROLE_VS_CURRENT,
]

// ── Regression: Abdulhakim class (generalized) ──────────────────────────────

export const ABDULHAKIM_CLASS_FIXTURE: V3TestFixture = {
  id: 'abdulhakim_class_regression',
  category: 'MULTI_ROLE_SERVICE_PROVIDER_WITH_EXPLICIT_BUYER_EVENT',
  description: 'The class of problem Abdulhakim exposed: a person simultaneously provides services AND has an explicit buyer event from a different organization. The buyer signal must not be suppressed by service-provider status. Timing may reduce urgency, but intent must be preserved.',
  rawText: `Multi-role professional with service agency and product company.
Person runs a software services agency (provides development services to clients).
Also founded a healthcare tech company (separate organization).
The healthcare company posted an explicit hiring request 3 months ago.
The post included: "Send resume, GitHub, and availability to apply."
The person is a service provider AND has an explicit buyer event.
V3 must score the hiring episode independently.
V3 must not zero the score because of service-provider status.
V3 should note aging timing but preserve intent.`,
  expectations: {
    minScore: 25,
    mustNotBeIdentityZero: true,
    buyerRequestDetected: true,
    buyerSignalNotSuppressed: true,
    minEpisodes: 1,
  },
}
