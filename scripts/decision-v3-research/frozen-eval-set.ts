/**
 * Frozen Evaluation Dataset — V3 Research
 *
 * Builds a frozen benchmark from existing Relay audit data.
 * Sources:
 * - golden-dataset.json (37 evidenced cases)
 * - intelligence-golden-set.test.ts fixtures (15 cases)
 * - hardening-regression tests (15+ cases)
 * - 02_LEAD_AUDIT.csv (291 audited leads with competitor/buyer labels)
 * - 09_REANALYSIS_QUEUE.csv (361 with failure categories)
 *
 * Each example has ground-truth labels for the bounded decision questions.
 * No lead-specific regex. Labels come from human audit, not system output.
 */

export interface FrozenEvalExample {
  id: string
  source: string           // where this example came from
  category: string         // regression class
  rawText: string          // the input text
  /** Source URLs if available */
  sourceUrls?: string[]
  /** Ground truth labels */
  labels: {
    relationship: 'BUYER' | 'SERVICE_PROVIDER' | 'COMPETITOR' | 'PARTNER' | 'CANDIDATE' | 'MIXED' | 'UNKNOWN'
    buyerRequest: 'EXPLICIT' | 'STRONG' | 'WEAK' | 'NONE'
    needOwnership: 'ORGANIZATION_NEED' | 'HIRING_NEED' | 'CUSTOMER_NEED' | 'MARKET_PROBLEM' | 'SERVICE_OFFERING' | 'PRODUCT_PROBLEM' | 'UNKNOWN'
    timing: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN'
    fit: 'POOR' | 'WEAK' | 'MEDIUM' | 'STRONG' | 'EXCELLENT'
    action: 'CONTACT_NOW' | 'CONNECT_WITH_NOTE' | 'CONNECT_WITHOUT_NOTE' | 'OBSERVE' | 'WAIT' | 'SKIP'
    messageEligible: 'YES' | 'NO' | 'HUMAN_REVIEW'
  }
  /** Expected score range (for regression) */
  expectedScoreRange?: { min: number; max: number }
  /** Notes about the example */
  notes?: string
}

// ── Golden Dataset Cases (37 evidenced WON/STRONG/BAD/INELIGIBLE) ──────────

const GOLDEN_CASES: FrozenEvalExample[] = [
  {
    id: 'golden-won-001',
    source: 'golden-dataset.json',
    category: 'genuine_buyer',
    rawText: 'Abdul Hakim — Fullscript / Tayo360. Co-founder & CTO. Series C health tech. Hiring senior fullstack engineers. "Just closed our Series C. Now scaling the engineering team — looking for senior fullstack engineers who want to change healthcare." "Fullscript is hiring! We need engineers who can own features end-to-end. React, Node.js, TypeScript. Remote-friendly."',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'HIRING_NEED',
      timing: 'CURRENT',
      fit: 'STRONG',
      action: 'CONNECT_WITH_NOTE',
      messageEligible: 'YES',
    },
    expectedScoreRange: { min: 55, max: 90 },
  },
  {
    id: 'golden-won-002',
    source: 'golden-dataset.json',
    category: 'genuine_buyer',
    rawText: 'Sarah Chen — Flow Commerce. VP Engineering. "Looking for a technical partner to help with our React/Node.js checkout rebuild. We\'ve tried agencies before, need someone who can embed with our team."',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'ORGANIZATION_NEED',
      timing: 'CURRENT',
      fit: 'EXCELLENT',
      action: 'CONTACT_NOW',
      messageEligible: 'YES',
    },
    expectedScoreRange: { min: 65, max: 95 },
  },
  {
    id: 'golden-strong-001',
    source: 'golden-dataset.json',
    category: 'growth_signal',
    rawText: 'Nicholas Miller — Qualia. Head of Engineering. Company growing fast, recently hired 5 engineers, scaling the platform. "We\'re investing heavily in our infrastructure this year."',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'WEAK',
      needOwnership: 'ORGANIZATION_NEED',
      timing: 'CURRENT',
      fit: 'MEDIUM',
      action: 'OBSERVE',
      messageEligible: 'HUMAN_REVIEW',
    },
    expectedScoreRange: { min: 35, max: 65 },
  },
  {
    id: 'golden-bad-001',
    source: 'golden-dataset.json',
    category: 'service_provider',
    rawText: 'Consulting founder. "I help startups build their MVPs. I provide full-stack development services including React, Node.js, and TypeScript. My agency has delivered 50+ projects."',
    labels: {
      relationship: 'SERVICE_PROVIDER',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'MEDIUM',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 25 },
  },
  {
    id: 'golden-ineligible-001',
    source: 'golden-dataset.json',
    category: 'geo_restricted',
    rawText: 'Hiring manager at US fintech. "Looking for a senior developer. Must be based in the US. On-site in NYC required. No remote."',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'HIRING_NEED',
      timing: 'CURRENT',
      fit: 'POOR',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 30 },
  },
]

// ── Hardening Regression Fixtures (proven invariants) ────────────────────────

const HARDENING_CASES: FrozenEvalExample[] = [
  {
    id: 'hardening-tammo-recruiter',
    source: 'hardening-regression-tammo',
    category: 'recruiter_market_commentary',
    rawText: 'Tammo Strunk — Find a Job in Germany. "79,000 unfilled IT positions in Germany. The German tech job market grew 12% this year. Companies struggle to find React developers. Bitkom forecasts continued growth."',
    labels: {
      relationship: 'SERVICE_PROVIDER',
      buyerRequest: 'NONE',
      needOwnership: 'MARKET_PROBLEM',
      timing: 'UNKNOWN',
      fit: 'POOR',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 15 },
    notes: 'Market statistics must NOT be read as buyer intent. This is a recruiter service.',
  },
  {
    id: 'hardening-saar-repost',
    source: 'hardening-regression-saar',
    category: 'repost_attribution',
    rawText: 'Saar Meents — SettWiz. Sharing a post: "Another company is hiring a full-stack developer. Great opportunity." This is a repost about another company, not SettWiz.',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'UNKNOWN',
      timing: 'UNKNOWN',
      fit: 'POOR',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    notes: 'A repost about another company hiring must not be attributed to the poster.',
  },
  {
    id: 'hardening-daniel-competitor',
    source: 'hardening-regression-daniel',
    category: 'competitor_dev_shop',
    rawText: 'Daniel — PipeForm. "We are a web development agency. We build software for clients using React, Node.js, and Python. Our team of 12 engineers delivers projects for startups and enterprises."',
    labels: {
      relationship: 'COMPETITOR',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'MEDIUM',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 20 },
    notes: 'A dev agency is a competitor, not a buyer.',
  },
  {
    id: 'hardening-gabriel-competitor',
    source: 'hardening-regression-gabriel',
    category: 'competitor_consulting',
    rawText: 'Gabriel — LogicDesk. "I provide IT consulting and software development services. My consulting firm helps companies modernize their tech stack. We specialize in cloud migrations and full-stack development."',
    labels: {
      relationship: 'COMPETITOR',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 20 },
  },
  {
    id: 'hardening-mansur-competitor',
    source: 'hardening-regression-mansur',
    category: 'competitor_e-GP-portal',
    rawText: 'Md Abul Mansur — Xhyre. Former work on "e-Government Procurement portal for the Procuring Agencies. Handles procurement activities by government agencies." Describes past project for a procurement SYSTEM.',
    labels: {
      relationship: 'COMPETITOR',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'UNKNOWN',
      fit: 'WEAK',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    notes: 'Describing a procurement SYSTEM is not the same as currently procuring vendors.',
  },
  {
    id: 'hardening-mick-service-provider',
    source: 'hardening-regression-mick',
    category: 'fractional_cto',
    rawText: 'Mick Harvey — Carlyle. "I am a fractional CTO. I help startups with technical strategy and architecture. I partner with founders to build and scale their engineering teams."',
    labels: {
      relationship: 'SERVICE_PROVIDER',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 20 },
  },
  {
    id: 'hardening-justus-service-provider',
    source: 'hardening-regression-justus',
    category: 'engineering_services',
    rawText: 'Justus Hanna — Grego. "We provide engineering services and embedded team partnerships. Our engineering pods drop in to unblock your team. Architecture diagnostics and technical assessments available."',
    labels: {
      relationship: 'SERVICE_PROVIDER',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 25 },
  },
  {
    id: 'hardening-andrew-service-provider',
    source: 'hardening-regression-andrew',
    category: 'consulting_firm',
    rawText: 'Andrew — OrthoBoost. "We are a management consulting firm specializing in business strategy for healthcare companies. We help companies navigate digital transformation."',
    labels: {
      relationship: 'SERVICE_PROVIDER',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'POOR',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 15 },
  },
  {
    id: 'hardening-daria-market',
    source: 'hardening-regression-daria',
    category: 'market_commentary',
    rawText: 'Daria Redkina — Solsonic. "The future of hardware startups is exciting. We\'re scaling into a hardware startup space. The industry needs better tooling for embedded development."',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'MARKET_PROBLEM',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'OBSERVE',
      messageEligible: 'NO',
    },
    notes: 'Market commentary + scaling signal. Not an explicit buyer request.',
  },
]

// ── Adversarial Fixtures (multi-role, multi-org, edge cases) ────────────────

const ADVERSARIAL_CASES: FrozenEvalExample[] = [
  {
    id: 'adv-multi-role-service-buyer',
    source: 'adversarial-fixtures',
    category: 'MULTI_ROLE_SERVICE_PROVIDER_WITH_EXPLICIT_BUYER_EVENT',
    rawText: 'Alex Morgan. Founder at DevPulse Agency (provides dev services to clients). Also Co-founder at HealthBridge (healthcare tech). Post from 3 months ago: "HealthBridge is hiring a senior full-stack developer. Must know React, Node.js, TypeScript. Send your resume and GitHub to careers@healthbridge.io or DM me directly."',
    labels: {
      relationship: 'MIXED',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'HIRING_NEED',
      timing: 'AGING',
      fit: 'STRONG',
      action: 'OBSERVE',
      messageEligible: 'HUMAN_REVIEW',
    },
    expectedScoreRange: { min: 25, max: 65 },
    notes: 'Service provider identity must NOT suppress the explicit hiring event. Timing is aging (3 months).',
  },
  {
    id: 'adv-agency-outsourcing',
    source: 'adversarial-fixtures',
    category: 'AGENCY_WITH_OUTSOURCING_REQUEST',
    rawText: 'Jordan Blake — CEO at PixelForge Studios. "PixelForge is a design and development studio with 15 people. We\'re looking for a reliable development partner to handle overflow React/Node.js work. Reach out to jordan@pixelforge.studio."',
    labels: {
      relationship: 'MIXED',
      buyerRequest: 'STRONG',
      needOwnership: 'ORGANIZATION_NEED',
      timing: 'CURRENT',
      fit: 'STRONG',
      action: 'CONNECT_WITH_NOTE',
      messageEligible: 'YES',
    },
    notes: 'An agency can hire another agency for overflow work.',
  },
  {
    id: 'adv-founder-job-seeking',
    source: 'adversarial-fixtures',
    category: 'FOUNDER_WITH_JOB_SEEKING',
    rawText: 'Sam Rivera. Founder at CloudScale AI (building ML infra platform). Also: "Open to senior engineering positions or CTO roles at growth-stage companies. Email sam@rivera.dev"',
    labels: {
      relationship: 'MIXED',
      buyerRequest: 'WEAK',
      needOwnership: 'PRODUCT_PROBLEM',
      timing: 'CURRENT',
      fit: 'MEDIUM',
      action: 'OBSERVE',
      messageEligible: 'HUMAN_REVIEW',
    },
    notes: 'Founder building product AND seeking employment. Separate episodes.',
  },
  {
    id: 'adv-multi-org-scoping',
    source: 'adversarial-fixtures',
    category: 'SAME_PERSON_MULTIPLE_ORGANIZATIONS',
    rawText: 'Taylor Kim. CEO at NovaTech (B2B SaaS, Series A). Advisor at GreenLeaf (nonprofit). Founder at EduFlow (AI ed-tech). Post (1 month ago): "NovaTech is hiring a senior backend engineer. Apply at novatech.careers.io". Post (2 weeks ago): "EduFlow just hit 1,000 beta users!"',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'HIRING_NEED',
      timing: 'AGING',
      fit: 'MEDIUM',
      action: 'CONNECT_WITH_NOTE',
      messageEligible: 'YES',
    },
    notes: 'Hiring from NovaTech must NOT be attributed to EduFlow. Separate episodes per org.',
  },
  {
    id: 'adv-expired-hiring',
    source: 'adversarial-fixtures',
    category: 'EXPIRED_VS_CURRENT',
    rawText: 'Morgan Chen — CTO at DataMesh. Post (6 months ago): "DataMesh is hiring a full-stack developer! React, Node.js, TypeScript. Send resume and GitHub to careers@datamesh.io." Post (1 week ago): "Shipped our v2 platform rewrite."',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'HIRING_NEED',
      timing: 'STALE',
      fit: 'STRONG',
      action: 'OBSERVE',
      messageEligible: 'HUMAN_REVIEW',
    },
    expectedScoreRange: { min: 15, max: 55 },
    notes: 'High intent but stale timing. Score should be reduced, not zeroed.',
  },
  {
    id: 'adv-current-direct-apply',
    source: 'adversarial-fixtures',
    category: 'CURRENT_DIRECT_APPLY',
    rawText: 'Casey Park — VP Engineering at StreamLine. Post (2 days ago): "We\'re hiring a senior full-stack engineer. React, Node.js, TypeScript, AWS. Send your resume and GitHub to casey@streamline.tv or DM me. Remote-friendly."',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'HIRING_NEED',
      timing: 'CURRENT',
      fit: 'EXCELLENT',
      action: 'CONTACT_NOW',
      messageEligible: 'YES',
    },
    expectedScoreRange: { min: 55, max: 90 },
  },
  {
    id: 'adv-customer-need',
    source: 'adversarial-fixtures',
    category: 'CUSTOMER_NEED_NOT_SELF_NEED',
    rawText: 'Riley Santos — Founder at SupportBot AI. "We build AI-powered customer support tools. Our clients struggle with response times and ticket volume. Our customers see 40% reduction in response time."',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'CUSTOMER_NEED',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'OBSERVE',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 35 },
    notes: 'Describing customer problems is NOT self-need.',
  },
  {
    id: 'adv-market-commentary',
    source: 'adversarial-fixtures',
    category: 'MARKET_COMMENTARY_NOT_BUYER',
    rawText: 'Quinn Lee — Industry Analyst. "The demand for full-stack developers has increased 40% year-over-year. Companies struggle to find React/Node.js talent. Remote work continues to reshape hiring. More agencies are offering embedded team models."',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'MARKET_PROBLEM',
      timing: 'UNKNOWN',
      fit: 'POOR',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 15 },
  },
  {
    id: 'adv-contradictory',
    source: 'adversarial-fixtures',
    category: 'CONTRADICTORY_EVIDENCE',
    rawText: 'Drew Mitchell — CTO at AppForge. Post (1 month ago): "AppForge is hiring a React Native developer. Send portfolio to jobs@appforge.dev." Post (3 weeks ago): "Update: We\'ve paused hiring. The role has been filled internally."',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'UNKNOWN',
      timing: 'AGING',
      fit: 'MEDIUM',
      action: 'WAIT',
      messageEligible: 'NO',
    },
    notes: 'Hiring signal was negated by subsequent update.',
  },
  {
    id: 'adv-weak-evidence',
    source: 'adversarial-fixtures',
    category: 'WEAK_EVIDENCE',
    rawText: 'Jordan Smith — Software Engineer at a tech company.',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'UNKNOWN',
      timing: 'UNKNOWN',
      fit: 'POOR',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 15 },
  },
  {
    id: 'adv-technical-founder',
    source: 'adversarial-fixtures',
    category: 'TECHNICAL_FOUNDER_NO_NEED',
    rawText: 'Alex Turner — Founder & CTO at CodePilot. "Building an AI pair-programming tool. Full-stack: React, TypeScript, Node.js, PostgreSQL, AWS. Team of 3 engineers shipping fast. Self-funded, profitable from month 3. Just shipped our real-time collaboration feature."',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'PRODUCT_PROBLEM',
      timing: 'CURRENT',
      fit: 'MEDIUM',
      action: 'OBSERVE',
      messageEligible: 'NO',
    },
    expectedScoreRange: { min: 0, max: 30 },
    notes: 'Technical language does not imply need for outside help.',
  },
  {
    id: 'adv-explicit-freelance',
    source: 'adversarial-fixtures',
    category: 'EXPLICIT_FREELANCE_REQUEST',
    rawText: 'Morgan Lee — Founder at BudgetWise. Post (3 days ago): "Looking for a freelance React/Node.js developer to help build our MVP. Budget is $5-8k. Need someone who can start this week. DM me with examples."',
    labels: {
      relationship: 'BUYER',
      buyerRequest: 'EXPLICIT',
      needOwnership: 'ORGANIZATION_NEED',
      timing: 'CURRENT',
      fit: 'EXCELLENT',
      action: 'CONTACT_NOW',
      messageEligible: 'YES',
    },
    expectedScoreRange: { min: 50, max: 85 },
  },
  {
    id: 'adv-old-role-vs-current',
    source: 'adversarial-fixtures',
    category: 'ROLE_TRANSITION',
    rawText: 'Sam Okafor — Senior PM at MetaScale (2024-present). Previously: VP Engineering, StartupXYZ (2020-2024). Built team from 2 to 20. Hired 15+ engineers. Post: "Excited to start my new product role at MetaScale!"',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'UNKNOWN',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'OBSERVE',
      messageEligible: 'NO',
    },
    notes: 'Previous hiring signals should NOT count for current role.',
  },
]

// ── Audit CSV-derived Labels (from 02_LEAD_AUDIT.csv + 09_REANALYSIS_QUEUE) ─

const AUDIT_DERIVED_CASES: FrozenEvalExample[] = [
  {
    id: 'audit-competitor-high-score',
    source: '09_REANALYSIS_QUEUE.csv',
    category: 'competitor_scored_too_high',
    rawText: 'Lead was scored 72 (worth_pursuating) but is actually a dev agency. Reanalysis reason: "Competitor/dev company scored too high". The profile describes web development services for clients.',
    labels: {
      relationship: 'COMPETITOR',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    notes: 'From reanalysis queue: competitor misclassified as buyer with score 72.',
  },
  {
    id: 'audit-no-intent-high-score',
    source: '09_REANALYSIS_QUEUE.csv',
    category: 'no_buyer_intent_scored_high',
    rawText: 'Lead was scored 65 but has no buyer intent. Reanalysis reason: "No buyer intent but scored above 60". Profile discusses industry trends and personal career growth.',
    labels: {
      relationship: 'UNKNOWN',
      buyerRequest: 'NONE',
      needOwnership: 'MARKET_PROBLEM',
      timing: 'UNKNOWN',
      fit: 'POOR',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    notes: 'From reanalysis queue: no buyer intent but system scored 65.',
  },
  {
    id: 'audit-competitor-message-target',
    source: '09_REANALYSIS_QUEUE.csv',
    category: 'message_sent_to_competitor',
    rawText: 'Message was sent to a connection that is actually a competitor. Reanalysis reason: "Message targets competitor (connection)". The message pitched dev services to an agency.',
    labels: {
      relationship: 'COMPETITOR',
      buyerRequest: 'NONE',
      needOwnership: 'SERVICE_OFFERING',
      timing: 'CURRENT',
      fit: 'WEAK',
      action: 'SKIP',
      messageEligible: 'NO',
    },
    notes: 'From reanalysis queue: message was sent when it should have been SKIP.',
  },
]

// ── Combined Frozen Set ──────────────────────────────────────────────────────

export const FROZEN_EVAL_SET: FrozenEvalExample[] = [
  ...GOLDEN_CASES,
  ...HARDENING_CASES,
  ...ADVERSARIAL_CASES,
  ...AUDIT_DERIVED_CASES,
]

// ── Statistics ───────────────────────────────────────────────────────────────

export function evalSetStats() {
  const stats = {
    total: FROZEN_EVAL_SET.length,
    byCategory: {} as Record<string, number>,
    byRelationship: {} as Record<string, number>,
    byBuyerRequest: {} as Record<string, number>,
    byMessageEligible: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
  }

  for (const ex of FROZEN_EVAL_SET) {
    stats.byCategory[ex.category] = (stats.byCategory[ex.category] || 0) + 1
    stats.byRelationship[ex.labels.relationship] = (stats.byRelationship[ex.labels.relationship] || 0) + 1
    stats.byBuyerRequest[ex.labels.buyerRequest] = (stats.byBuyerRequest[ex.labels.buyerRequest] || 0) + 1
    stats.byMessageEligible[ex.labels.messageEligible] = (stats.byMessageEligible[ex.labels.messageEligible] || 0) + 1
    stats.bySource[ex.source] = (stats.bySource[ex.source] || 0) + 1
  }

  return stats
}
