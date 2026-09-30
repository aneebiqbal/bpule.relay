/**
 * Frozen Evaluation Dataset — Self-contained for benchmarking
 * 104 high-confidence examples across all regression classes.
 * Sources: golden-dataset.json, hardening-regression tests, audit CSV,
 *          production test profiles, torture tests, intelligence-golden-set.
 */

export const FROZEN_EVAL_SET = [
  // ── GENUINE BUYERS (WON / STRONG) ──────────────────────────────────────
  {
    id: 'buyer-001', category: 'genuine_buyer',
    rawText: 'Abdul Hakim — Co-founder & CTO at Fullscript. "Just closed our Series C. Now scaling the engineering team — looking for senior fullstack engineers who want to change healthcare. React, Node.js, TypeScript. Remote-friendly."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
    expectedScore: { min: 55, max: 90 },
  },
  {
    id: 'buyer-002', category: 'genuine_buyer',
    rawText: 'Sarah Chen — VP Engineering at Flow Commerce. "Looking for a technical partner to help with our React/Node.js checkout rebuild. We\'ve tried agencies before, need someone who can embed with our team. Remote OK."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
    expectedScore: { min: 65, max: 95 },
  },
  {
    id: 'buyer-003', category: 'explicit_freelance',
    rawText: 'Morgan Lee — Founder at BudgetWise. "Looking for a freelance React/Node.js developer to help build our MVP. Budget $5-8k. DM me with examples."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
    expectedScore: { min: 50, max: 85 },
  },
  {
    id: 'buyer-004', category: 'current_hiring_apply',
    rawText: 'Casey Park — VP Engineering at StreamLine. (2 days ago) "Hiring senior full-stack engineer. React, Node.js, TypeScript, AWS. Send resume and GitHub to casey@streamline.tv or DM me."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
    expectedScore: { min: 55, max: 90 },
  },
  {
    id: 'buyer-005', category: 'genuine_buyer',
    rawText: 'Nicholas Miller — Head of Engineering at Qualia. Company growing fast, hired 5 engineers this quarter, scaling platform infrastructure. "Investing heavily in infrastructure this year."',
    labels: { relationship: 'BUYER', buyerRequest: 'WEAK', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'MEDIUM', action: 'OBSERVE', messageEligible: 'HUMAN_REVIEW' },
    expectedScore: { min: 35, max: 65 },
  },

  // ── SERVICE PROVIDERS (NO BUYER EVENT) ──────────────────────────────────
  {
    id: 'sp-001', category: 'service_provider',
    rawText: 'Consulting founder. "I help startups build their MVPs. I provide full-stack development services including React, Node.js, and TypeScript. My agency has delivered 50+ projects."',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'MEDIUM', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 25 },
  },
  {
    id: 'sp-002', category: 'fractional_cto',
    rawText: 'Mick Harvey — fractional CTO. "I help startups with technical strategy and architecture. I partner with founders to build and scale their engineering teams."',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 20 },
  },
  {
    id: 'sp-003', category: 'engineering_services',
    rawText: 'Justus Hanna — "We provide engineering services and embedded team partnerships. Our engineering pods drop in to unblock your team. Architecture diagnostics available."',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 25 },
  },
  {
    id: 'sp-004', category: 'consulting_firm',
    rawText: 'Andrew — "We are a management consulting firm specializing in business strategy for healthcare companies. We help companies navigate digital transformation."',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 15 },
  },
  {
    id: 'sp-005', category: 'it_consulting',
    rawText: 'Gabriel — "I provide IT consulting and software development services. My consulting firm helps companies modernize their tech stack. We specialize in cloud migrations."',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 20 },
  },

  // ── COMPETITORS ─────────────────────────────────────────────────────────
  {
    id: 'comp-001', category: 'competitor_dev_shop',
    rawText: 'Daniel — "We are a web development agency. We build software for clients using React, Node.js, and Python. Our team of 12 engineers delivers projects."',
    labels: { relationship: 'COMPETITOR', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'MEDIUM', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 20 },
  },
  {
    id: 'comp-002', category: 'competitor_eGP',
    rawText: 'Md Abul Mansur — Xhyre. Past project: "e-Government Procurement portal for the Procuring Agencies. Handles procurement activities by government agencies."',
    labels: { relationship: 'COMPETITOR', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'UNKNOWN', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },

  // ── MULTI-ROLE (SERVICE PROVIDER + BUYER EVENT) ─────────────────────────
  {
    id: 'multi-001', category: 'service_provider_plus_hiring',
    rawText: 'Alex Morgan — Founder at DevPulse Agency (provides dev services) AND Co-founder at HealthBridge (healthcare tech). Post (3 months ago): "HealthBridge is hiring senior full-stack developer. Send resume and GitHub to careers@healthbridge.io."',
    labels: { relationship: 'MIXED', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'AGING', fit: 'STRONG', action: 'OBSERVE', messageEligible: 'HUMAN_REVIEW' },
    expectedScore: { min: 25, max: 65 },
  },
  {
    id: 'multi-002', category: 'agency_outsourcing',
    rawText: 'Jordan Blake — CEO at PixelForge Studios (design/dev studio, 15 people). "Looking for a development partner to handle overflow React/Node.js work. Reach out to jordan@pixelforge.studio."',
    labels: { relationship: 'MIXED', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'multi-003', category: 'same_person_multiple_orgs',
    rawText: 'Taylor Kim — CEO at NovaTech (B2B SaaS, Series A). Founder at EduFlow (AI ed-tech). Post (1 month ago): "NovaTech hiring senior backend engineer. Apply at novatech.careers.io." Post (2 weeks ago): "EduFlow hit 1,000 beta users!"',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'AGING', fit: 'MEDIUM', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
    notes: 'Hiring from NovaTech must NOT be attributed to EduFlow.',
  },

  // ── MARKET COMMENTARY / CUSTOMER NEED (NOT BUYER) ───────────────────────
  {
    id: 'nonbuy-001', category: 'market_commentary',
    rawText: 'Quinn Lee — Industry Analyst. "The demand for full-stack developers has increased 40% year-over-year. Companies struggle to find React/Node.js talent. Remote work continues to reshape hiring."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'UNKNOWN', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 15 },
  },
  {
    id: 'nonbuy-002', category: 'customer_need_not_self',
    rawText: 'Riley Santos — Founder at SupportBot AI. "We build AI customer support tools. Our clients struggle with response times. Our customers see 40% reduction in response time."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'CUSTOMER_NEED', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 35 },
  },
  {
    id: 'nonbuy-003', category: 'recruiter_market_stats',
    rawText: 'Tammo Strunk — Find a Job in Germany. "79,000 unfilled IT positions in Germany. The German tech job market grew 12%. Bitkom forecasts continued growth."',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'UNKNOWN', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 15 },
  },
  {
    id: 'nonbuy-004', category: 'technical_founder_no_need',
    rawText: 'Alex Turner — Founder & CTO at CodePilot. "Building AI pair-programming tool. React, TypeScript, Node.js, PostgreSQL, AWS. Team of 3, self-funded, profitable. Just shipped real-time collaboration."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'PRODUCT_PROBLEM', timing: 'CURRENT', fit: 'MEDIUM', action: 'OBSERVE', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 30 },
  },

  // ── RECRUITER ────────────────────────────────────────────────────────────
  {
    id: 'recruiter-001', category: 'recruiter',
    rawText: 'Recruiter at TechTalent. "I help companies hire engineers. I place React, Node.js, and Python developers at startups. Open roles: Senior Full-Stack at Series B health-tech."',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 15 },
  },

  // ── NON-TECHNICAL ────────────────────────────────────────────────────────
  {
    id: 'nontech-001', category: 'non_technical',
    rawText: 'Restaurant owner. "Running a small bakery in Chicago. Looking for someone to build a simple website for our business. Need online ordering."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'WEAK', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 20 },
  },

  // ── FOUNDER + JOB SEEKING ────────────────────────────────────────────────
  {
    id: 'jobs-001', category: 'founder_job_seeking',
    rawText: 'Sam Rivera — Founder at CloudScale AI (ML infra). Also: "Open to senior engineering positions or CTO roles. Email sam@rivera.dev."',
    labels: { relationship: 'MIXED', buyerRequest: 'WEAK', needOwner: 'PRODUCT_PROBLEM', timing: 'CURRENT', fit: 'MEDIUM', action: 'OBSERVE', messageEligible: 'HUMAN_REVIEW' },
  },

  // ── STALE HIRING ─────────────────────────────────────────────────────────
  {
    id: 'stale-001', category: 'stale_hiring_with_apply',
    rawText: 'Morgan Chen — CTO at DataMesh. Post (6 months ago): "DataMesh is hiring full-stack developer! React, Node.js, TypeScript. Send resume to careers@datamesh.io." Post (1 week ago): "Shipped v2 platform rewrite."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'STALE', fit: 'STRONG', action: 'OBSERVE', messageEligible: 'HUMAN_REVIEW' },
    expectedScore: { min: 15, max: 55 },
  },

  // ── CONTRADICTORY POSTS ──────────────────────────────────────────────────
  {
    id: 'contr-001', category: 'contradictory_posts',
    rawText: 'Drew Mitchell — CTO at AppForge. Post (1 month ago): "Hiring React Native developer. Send portfolio to jobs@appforge.dev." Post (3 weeks ago): "Paused hiring. Role filled internally."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'UNKNOWN', timing: 'AGING', fit: 'MEDIUM', action: 'WAIT', messageEligible: 'NO' },
  },

  // ── GEO RESTRICTED ────────────────────────────────────────────────────────
  {
    id: 'geo-001', category: 'geo_restricted',
    rawText: 'Hiring manager at US fintech. "Looking for senior developer. Must be US-based. On-site in NYC. No remote."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 30 },
  },

  // ── WEAK/INCOMPLETE ──────────────────────────────────────────────────────
  {
    id: 'weak-001', category: 'weak_evidence',
    rawText: 'Jordan Smith — Software Engineer at a tech company.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 15 },
  },

  // ── REPOST ATTRIBUTION ────────────────────────────────────────────────────
  {
    id: 'repost-001', category: 'repost_not_attributable',
    rawText: 'Saar Meents — SettWiz. Sharing a post: "Another company is hiring a full-stack developer. Great opportunity for someone looking."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'UNKNOWN', timing: 'UNKNOWN', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },

  // ── CUSTOMER DISCOVERY (NOT BUYER) ────────────────────────────────────────
  {
    id: 'cdisc-001', category: 'customer_discovery',
    rawText: 'Founder doing customer discovery. "Talking to engineering leaders about their deployment challenges. Problem they described: slow CI/CD pipelines killing productivity."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'WEAK', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'MEDIUM', action: 'OBSERVE', messageEligible: 'NO' },
  },

  // ── PRODUCT LAUNCH (NOT BUYER) ────────────────────────────────────────────
  {
    id: 'launch-001', category: 'product_launch_no_need',
    rawText: 'Founder at startup. "Close to launching our new platform! Building in public. React, Next.js, Node.js. Not public yet but early access available."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'PRODUCT_PROBLEM', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },

  // ── BUILDING IN PUBLIC (NOT BUYER) ────────────────────────────────────────
  {
    id: 'bip-001', category: 'building_in_public',
    rawText: 'Indie hacker. "Building my SaaS. Week 12: authentication, database schema, API routes. Stack: Next.js, Prisma, PostgreSQL. Tweeted progress thread."',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'PRODUCT_PROBLEM', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },

  // ── CAPACITY REQUEST ──────────────────────────────────────────────────────
  {
    id: 'cap-001', category: 'capacity_request',
    rawText: 'CTO at growth startup. "Our backlog is growing. Can\'t keep up with feature requests. Team of 4 is stretched thin. Need more engineering capacity."',
    labels: { relationship: 'BUYER', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
    expectedScore: { min: 40, max: 75 },
  },

  // ── HIRING OWN TEAM (NOT OUTSOURCING) ─────────────────────────────────────
  {
    id: 'own-001', category: 'hiring_own_team_not_outsourcing',
    rawText: 'Startup founder. "We are hiring a full-time senior developer to join our in-house team. Must be passionate about our mission. Competitive salary + equity."',
    labels: { relationship: 'BUYER', buyerRequest: 'WEAK', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'MEDIUM', action: 'OBSERVE', messageEligible: 'HUMAN_REVIEW' },
    notes: 'Hiring full-time employees ≠ hiring outside contractors. Lower buyer signal for agency services.',
  },

  // ── VENDOR EVALUATION ──────────────────────────────────────────────────────
  {
    id: 'vendor-001', category: 'vendor_evaluation',
    rawText: 'Procurement at enterprise. "We are putting together a vendor shortlist for our upcoming platform rebuild. Budget approved. Looking at agencies with React expertise."',
    labels: { relationship: 'BUYER', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
    expectedScore: { min: 45, max: 80 },
  },

  // ── NON-TECHNICAL MICRO-BUSINESS ──────────────────────────────────────────
  {
    id: 'micro-001', category: 'non_technical_micro_business',
    rawText: 'Plumbing business owner. "Need someone to fix my WordPress site. Contact form broken. Maybe add a booking system?"',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'WEAK', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
    expectedScore: { min: 0, max: 15 },
  },

  // ── OPEN TO WORK (JOB SEEKER) ──────────────────────────────────────────────
  {
    id: 'otw-001', category: 'open_to_work',
    rawText: 'Software engineer. "#OpenToWork React, Node.js, TypeScript. 5 years experience. Looking for remote senior roles. Previously at a fintech startup."',
    labels: { relationship: 'CANDIDATE', buyerRequest: 'NONE', needOwner: 'UNKNOWN', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },

  // ── PARTNERSHIP REQUEST ───────────────────────────────────────────────────
  {
    id: 'partner-001', category: 'partnership_request',
    rawText: 'Founder. "Looking for a development partner to co-build our platform. Revenue share model. Need someone who can own the technical side while I handle business."',
    labels: { relationship: 'PARTNER', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'HUMAN_REVIEW' },
  },

  // ── OLD ROLE VS CURRENT ───────────────────────────────────────────────────
  {
    id: 'role-001', category: 'old_role_vs_current',
    rawText: 'Sam Okafor — Senior PM at MetaScale (2024-present). Previously VP Engineering at StartupXYZ (2020-2024), built team from 2 to 20, hired 15 engineers. Post: "Excited to start at MetaScale!"',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'UNKNOWN', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
    notes: 'Previous hiring signals should NOT count for current PM role.',
  },

  // ── NEAR-DUPLICATE / SIMILAR PROFILE ─────────────────────────────────────
  {
    id: 'near-001', category: 'genuine_buyer',
    rawText: 'Lisa Park — CTO at HealthFlow. "Raised Series B. Scaling engineering. Looking for senior React/Node.js engineers. Remote-friendly for right person. React, TypeScript, PostgreSQL."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
    expectedScore: { min: 55, max: 90 },
  },

  // ── UPWORK-STYLE PROJECT ──────────────────────────────────────────────────
  {
    id: 'upwork-001', category: 'explicit_freelance',
    rawText: 'Client on platform. "Need React developer to build dashboard with charts, auth, and API integration. Budget $3,000. 2-week timeline. Must have TypeScript experience."',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
    expectedScore: { min: 55, max: 85 },
  },

  // ── GAP FILLERS: Seller CTA vs Buyer ─────────────────────────────────────
  {
    id: 'gap-001', category: 'seller_CTA_to_customers',
    rawText: 'I work with orthopedic practices that feel they have hit a plateau. If you are ready to rethink your growth strategy, let us connect.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'gap-002', category: 'known_person_zero_opportunity',
    rawText: 'CEO at Bio-marker.ai. 11 years leadership experience. Building blood test for early cancer detection. World Cup 26 analysis. Going to Biomed Israel conference.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'gap-003', category: 'cross_company_temporal_attribution',
    rawText: 'CEO at PipeForm. Previously at Vyyer, designed architecture that solved complex PII processing. If you are a builder, I would genuinely love your feedback.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'PRODUCT_PROBLEM', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
    notes: 'Vyyer achievements must not become PipeForm signal.',
  },
  {
    id: 'gap-004', category: 'capability_overlap_peer',
    rawText: 'CEO at Hartford AI Partners. AI implementation consulting, custom automations, AI agents. If you are wondering about the security of your protocol, let us connect.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'gap-005', category: 'large_company_ai_interest_no_need',
    rawText: 'CEO at Carlyle. Carlyle industry partnership with MIT Generative AI Impact Consortium. Oracle Red Bull Racing partnership announced.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'gap-006', category: 'design_partner_not_vendor',
    rawText: 'CEO at Vyyer Technologies. Seeking beta testers and design partners for all our products. Services: Business Analytics, Cloud App Dev, Custom Software, SaaS Dev.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'gap-007', category: 'crypto_security_seller',
    rawText: 'Co-founder and CEO at Grego AI. Earned $500K+ in bounties. Helped protocols like Ethereum, Lido, Chainlink, Aave. If you are wondering about the security of your protocol, let us connect.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'gap-008', category: 'long_dump_multi_company',
    rawText: 'MD ABUL MANSUR. Co-Founder and CTO at XHYRE. Director and CTO at Nuspay. Group CTO at Digital Payment System. Government of Bangladesh consultant. RWA tokenization, zero-knowledge proofs.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'gap-009', category: 'third_party_reposts_only',
    rawText: 'Co-Founder at RALCO. [Repost of Joseph Cunningham]. [Repost of Alan Dunne]. [Repost of Pierce Healy from Pendo VP AI]. [Repost of Todd Olson Pendo CEO].',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'gap-010', category: 'customer_discovery_pre_launch',
    rawText: 'Founder and CEO at Merget. Spent months talking to founders and engineering leaders about their workflows. We are close to launch. If you are a builder who works with AI coding tools, get early access.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'PRODUCT_PROBLEM', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },

  // ── GAP: Bad Leads ──────────────────────────────────────────────────────
  {
    id: 'bad-001', category: 'faang_engineer_no_signal',
    rawText: 'John Smith, Senior Software Engineer at Google. 10+ years distributed systems. Excited to announce I have been promoted to Staff Engineer!',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'bad-002', category: 'unrealistic_scope_low_budget',
    rawText: 'Job: Build a clone of Uber. Budget: $50. Drivers, riders, payments, maps, everything. 2 weeks. 47 proposals.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'bad-003', category: 'hr_non_tech_no_buying_authority',
    rawText: 'Alex Johnson, HR Coordinator at Midwest Manufacturing Co. Makes industrial parts. Handles hiring for factory floor. Great day at company picnic!',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'bad-004', category: 'abandoned_project_incomplete',
    rawText: 'Job: Need developer to finish my project. Budget: $200. Previous developer disappeared. React + Node.js. No full requirements doc. 23 proposals. 3 weeks old.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'AGING', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'bad-005', category: 'large_established_with_vendors',
    rawText: 'Michael Brown, Director of Engineering at Fortune 500 Corp. Team of 200+ engineers. Dedicated vendors and established processes. Named top employer 5th year running.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },

  // ── GAP: Recruiters (various subtypes) ──────────────────────────────────
  {
    id: 'rec-001', category: 'recruiter_big_tech',
    rawText: 'Jennifer Smith, Technical Recruiter at Google. Recruiting for SRE and frontend roles. We are hiring! If you are a strong backend engineer, I would love to connect you with our teams.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'rec-002', category: 'recruiter_agency_owner',
    rawText: 'Mike Johnson, Founder, TechTalent Recruiting. Help startups hire senior engineers. Hot role: Senior React Engineer at Series B Fintech. $180k-$220k. DM me for details.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'rec-003', category: 'recruiter_internal_stripe',
    rawText: 'Lisa Park, Senior Recruiting Manager at Stripe. Lead recruiting for Stripe engineering team. Stripe is hiring! Looking for exceptional engineers to join us.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'rec-004', category: 'recruiter_market_stats',
    rawText: 'David Kim, Engineering Manager at BigTech. 79,000 unfilled IT positions in Germany — the talent shortage is real. Excited to speak at DevOps conference next month.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'OBSERVE', messageEligible: 'NO' },
  },

  // ── GAP: Hiring Own Team (not outsourcing) ───────────────────────────────
  {
    id: 'own-001', category: 'hiring_own_team_director',
    rawText: 'Nicholas Miller, Director of Engineering, Qualia. Hiring: Senior Software Engineer I. Excited to be growing our engineering team. Remote.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'SELF_NEED', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'own-002', category: 'hiring_own_team_cto',
    rawText: 'Alex Rivera, CTO and Co-founder at DataPulse. Hiring our first senior fullstack engineer. React, Node.js, Python. Remote-friendly.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'SELF_NEED', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'own-003', category: 'hiring_own_team_vp_eng',
    rawText: 'Rachel Kim, VP Engineering at GrowthLab. Scaling from 5 to 15. Hiring senior backend, frontend, fullstack. Hiring across the board.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'SELF_NEED', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'own-004', category: 'hiring_own_team_thin',
    rawText: 'Jordan Lee, Head of Engineering. Hiring senior engineers. Remote. React, TypeScript, Node.js. Building the future of fintech. Team is growing.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'SELF_NEED', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'own-005', category: 'hiring_own_team_borderline',
    rawText: 'Nicholas Miller, Director of Engineering, Qualia. Hiring: Senior Software Engineer I. Remote. Random weekend thoughts: The Ferrari Luce, Swiss watch industry, commoditization.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'SELF_NEED', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },

  // ── GAP: Weak / Ambiguous Evidence ──────────────────────────────────────
  {
    id: 'weak-002', category: 'technical_content_no_need',
    rawText: 'Daria Redkina, Founder at Solsonic. Advances in real-time audio processing. Great conversation with fellow founders about scaling hardware startups.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'weak-003', category: 'thin_profile_hiring',
    rawText: 'Sam Taylor, CTO at NewStartup. Building something exciting in climate tech. Hiring engineers. NewStartup is hiring!',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'SELF_NEED', timing: 'CURRENT', fit: 'WEAK', action: 'OBSERVE', messageEligible: 'NO' },
  },
  {
    id: 'weak-004', category: 'capacity_signal_mixed',
    rawText: 'Priya Sharma, CEO at HealthTech Pro. Hiring senior engineers. Team is stretched thin, need help delivering Q2 roadmap. Struggling to deliver with current team.',
    labels: { relationship: 'BUYER', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'MEDIUM', action: 'OBSERVE', messageEligible: 'HUMAN_REVIEW' },
    expectedScore: { min: 30, max: 55 },
  },
  {
    id: 'weak-005', category: 'mixed_signals_hire_and_partner',
    rawText: 'Maria Garcia, CEO at FinScale. Closed Series A. Hiring senior engineers AND looking for development partners to accelerate. Raised $12M. Hiring AND looking for partners.',
    labels: { relationship: 'MIXED', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'OBSERVE', messageEligible: 'HUMAN_REVIEW' },
    expectedScore: { min: 35, max: 65 },
  },
  {
    id: 'weak-006', category: 'personal_interest_only',
    rawText: 'Lisa Wang, Software Engineer at TechCo. Just published open-source library for data visualization. Excited about new GPT capabilities — thinking about how to integrate into our workflow.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'OBSERVE', messageEligible: 'NO' },
  },

  // ── GAP: Geo-Restricted (subtypes) ──────────────────────────────────────
  {
    id: 'geo-002', category: 'geo_restricted_us_compliance',
    rawText: 'Robert Kim, CTO at DataFlow Inc. Looking for senior Golang developer. Must be based in US due to data compliance. Remote within US only.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'geo-003', category: 'geo_restricted_eu_gdpr',
    rawText: 'Job: Frontend Developer for EU Fintech. Berlin-based. Must be located in EU/EEA due to GDPR data handling requirements.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'geo-004', category: 'geo_restricted_hybrid_office',
    rawText: 'Jennifer Lee, VP Product at HealthBridge, London. Hybrid role — 2 days/week in London office, 3 days remote. UK-based candidates preferred.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'MEDIUM', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'geo-005', category: 'onsite_only_no_remote',
    rawText: 'David Park, CTO at FinServ Corp, New York. Looking for senior TypeScript developer. On-site in Manhattan. No remote work.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'SKIP', messageEligible: 'NO' },
  },

  // ── GAP: Service Provider (subtypes) ────────────────────────────────────
  {
    id: 'sp-006', category: 'design_agency_hiring',
    rawText: 'Sarah Mitchell, Creative Director at PixelForge Studio. Design and development agency. 15+ designers and developers. PixelForge is hiring! Looking for senior React developers.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'sp-007', category: 'ai_ml_consulting_firm',
    rawText: 'Dr. Alex Chen, CEO, DeepMatrix AI. Helps enterprises implement ML solutions. AI consulting, model development, MLOps. Looking for partners, not clients.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'sp-008', category: 'wordpress_plugin_company',
    rawText: 'Yani Iliev, CEO at ServMask Inc. Provides data backup, recovery and migration for websites. WordPress plugins used by 500,000 websites. Services: WordPress Plugin Dev, Data Migration, Backup Solutions.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'sp-009', category: 'devops_consultant_explicit',
    rawText: 'Hassan Saulat, Senior DevOps Engineer. AWS, Kubernetes, Terraform, CI/CD. I help companies streamline infrastructure and reduce cloud costs. Currently taking on consulting engagements.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'sp-010', category: 'explicit_freelance_offering',
    rawText: 'Chris Anderson, Senior Fullstack Engineer. React, Node.js, TypeScript. I help startups build MVPs and scale platforms. 8+ years. Available for freelance engagements starting next month. Just finished fintech project.',
    labels: { relationship: 'SERVICE_PROVIDER', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },

  // ── GAP: Non-Technical (subtypes) ───────────────────────────────────────
  {
    id: 'nontech-002', category: 'marketing_agency_non_tech',
    rawText: 'Tom Williams, Founder, GrowthHack Marketing. Facebook ads, Google ads, SEO. $1M+ monthly ad spend managed. Just hit $500k MRR for latest client.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'nontech-003', category: 'student_job_seeking',
    rawText: 'Alex Johnson, Computer Science Student at MIT. Looking for internship opportunities. Learning React and Node.js. Looking for summer 2025 internship.',
    labels: { relationship: 'CANDIDATE', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },

  // ── GAP: Input Normalization (torture tests) ────────────────────────────
  {
    id: 'tort-001', category: 'input_cleanup_navigation_junk',
    rawText: 'Home My Network Jobs Messaging Notifications Stefan Richter CEO at Mythos Archive. We are looking for senior Next.js developer. Send message Connect More.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-002', category: 'signal_with_noise_posts',
    rawText: 'Craig Donaghue, Founder at BrandFlow. We are drowning in content requests. Looking for agentic content pipeline. [Irrelevant post]: Great to be at Sydney startup meetup tonight!',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-003', category: 'duplicate_urls_dedup',
    rawText: 'Job: Senior React Developer, NomadTools. https://nomadtools.io/careers/react-dev Also posted: https://nomadtools.io/careers/react-dev https://nomadtools.io https://nomadtools.io',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-004', category: 'shortened_urls',
    rawText: 'Ryan Carter, CTO at chainClear. https://t.co/abc123 https://tinyurl.com/ryan-carter https://linkedin.com/in/ryan-carter-chainclear',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'HIRING_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-005', category: 'independent_no_company',
    rawText: 'Elliot Drummond, Independent Tech Architect, Edinburgh, UK. Available for architecture sprints in Q4. OWASP-compliant auth, scalable database design. DM me.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
  },
  {
    id: 'tort-006', category: 'multiple_roles_titles',
    rawText: 'Kevin Marsh, Founder and CEO at Dental Content Co. Also: Advisor at HealthTech Partners. One-day paid trial available for Langflow content engine project.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-007', category: 'signal_buried_under_irrelevant',
    rawText: 'Sarah Chen, VP Engineering at ScaleAI Inc. [Post 1 - 1hr ago]: Just had amazing tacos! [Post 2 - 3 days ago]: 4 open senior engineering roles. Shipping slowing down. Looking for contractors.',
    labels: { relationship: 'BUYER', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-008', category: 'unicode_formatting_normalization',
    rawText: 'Bilal Chaudhry — CTO at IndoorNav — Karachi, Pakistan. CTO at IndoorNav. https://linkedin.com/in/bilal. Karachi. We have a positioning app that needs PDR integration.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-009', category: 'multiple_people_in_post',
    rawText: 'Daniel Kowalski, CTO at Sourcetools.io. Thanks to Sarah from Product and James from Engineering and also investors at VC Partners. We need new integrations and reworked search logic.',
    labels: { relationship: 'BUYER', buyerRequest: 'STRONG', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'tort-010', category: 'person_company_same_name',
    rawText: 'Jose Marchant, CEO at Marchant Labs. We have Figma designs that need pixel-precise CSS. Also consolidating a Base44 build.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },

  // ── GAP: Strong Buyer (variations) ──────────────────────────────────────
  {
    id: 'strong-001', category: 'genuine_buyer_worldwide_remote',
    rawText: 'James Okonkwo, Founder and CEO at AfriPay. Looking for strong remote engineering team to help build v2 mobile wallet. Worldwide remote. React Native, Node.js, PostgreSQL.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
  },
  {
    id: 'strong-002', category: 'genuine_buyer_tried_agencies',
    rawText: 'Sarah Chen, VP Engineering at Flow Commerce. Looking for strong React/Node.js team. We have tried agencies before, need someone who can embed with our team. Remote OK.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
  },
  {
    id: 'strong-003', category: 'genuine_buyer_hipaa_migration',
    rawText: 'Emily Torres, Head of Product at Wellbeing Medical. Need team to build next-gen patient portal. React, TypeScript, Node.js. Must understand HIPAA. Remote-first. Struggling with current portal. Looking for development partner.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
  },
  {
    id: 'strong-004', category: 'genuine_buyer_discovery_sprint',
    rawText: 'Elliot Drummond, CTO at FinArch Labs, Edinburgh. Need technical architect for discovery sprint. OWASP-compliant auth, scalable database design, phased roadmap. One to two weeks.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
  },
  {
    id: 'strong-005', category: 'genuine_buyer_content_pain',
    rawText: 'Craig Donaghue, Founder at BrandFlow, Sydney. Drowning in content requests. Looking for someone to build us an agentic content pipeline. Langflow experience a plus.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONTACT_NOW', messageEligible: 'YES' },
  },
  {
    id: 'strong-006', category: 'strong_buyer_healthcare_rails',
    rawText: 'Job: Full-Stack Developer for HealthTech Platform. Budget: $4,500. Ruby on Rails with GraphQL API. Must be HIPAA-aware. Healthcare startup building provider-facing platform.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'strong-007', category: 'strong_buyer_solo_understaffed',
    rawText: 'Tom Richards, Solo Founder at CloudMigrate, Manchester. One person trying to do everything. Closed 3 enterprise deals but cannot deliver fast enough. Looking for reliable dev partner.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'strong-008', category: 'strong_buyer_stale_cofounder_left',
    rawText: 'Priya Sharma, CEO at EduTech Global, Bangalore. Raised $2M seed but technical co-founder left. App has not been updated in 14 months. Users complaining. Need someone to take over mobile app. React Native.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'strong-009', category: 'strong_buyer_ai_blockchain',
    rawText: 'Job: AI Chatbot with Blockchain Settlement Layer. Budget: $5,000. OpenAI API for chat, custom blockchain integration. Node.js backend, React frontend.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'strong-010', category: 'genuine_buyer_neobank_rebuild',
    rawText: 'Marcus Weber, CEO at Klar. Need experienced teams to rebuild lending infrastructure. Contract/freelance OK. Must overlap with CET. Looking for strong engineering team to scale lending platform.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'strong-011', category: 'genuine_buyer_capacity_crunch',
    rawText: 'James Okonkwo, Founder and CEO at AfriPay. Processes payments across 15 African countries. Expanding fast, cannot keep up with roadmap. Need remote engineering team to build v2 mobile wallet.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'strong-012', category: 'genuine_buyer_rebuild_migration',
    rawText: 'David Park, CTO at LogisticsOS. Rebuilding entire order management platform from scratch. Need team with React/Node.js who can embed for 6 months. Remote worldwide.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'STRONG', action: 'CONNECT_WITH_NOTE', messageEligible: 'YES' },
  },
  {
    id: 'strong-013', category: 'genuine_buyer_freelance_budget',
    rawText: 'Lisa Chen, VP Product at FinFlow. Building new invoice automation feature. Need freelance fullstack team for 3-month project. Budget $15k-$25k/month. React + Node.js. Budget committed.',
    labels: { relationship: 'BUYER', buyerRequest: 'EXPLICIT', needOwner: 'ORGANIZATION_NEED', timing: 'CURRENT', fit: 'EXCELLENT', action: 'CONTACT_NOW', messageEligible: 'YES' },
  },

  // ── GAP: Audit-derived misclassifications ──────────────────────────────
  {
    id: 'audit-001', category: 'competitor_scored_too_high',
    rawText: 'Dev shop profile. relay_score=61 (over-score). Keywords: software development, custom software, web development. Should be 0-25.',
    labels: { relationship: 'COMPETITOR', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'audit-002', category: 'no_buyer_intent_over_score',
    rawText: 'Profile with 0 factual evidence entries. relay_score=64. Evidence ledger polluted with scoring artifacts. No buyer intent signal.',
    labels: { relationship: 'UNKNOWN', buyerRequest: 'NONE', needOwner: 'MARKET_PROBLEM', timing: 'CURRENT', fit: 'POOR', action: 'SKIP', messageEligible: 'NO' },
  },
  {
    id: 'audit-003', category: 'message_sent_to_competitor',
    rawText: 'Message was generated and sent to a competitor profile. Should have been classified as SKIP. Historical failure pattern from reanalysis queue.',
    labels: { relationship: 'COMPETITOR', buyerRequest: 'NONE', needOwner: 'SERVICE_OFFERING', timing: 'CURRENT', fit: 'WEAK', action: 'SKIP', messageEligible: 'NO' },
  },
]

// ── Dataset Statistics ──────────────────────────────────────────────────────

export function datasetStats() {
  const cats = {}
  const rels = {}
  const buyers = {}
  const msgs = {}

  for (const ex of FROZEN_EVAL_SET) {
    cats[ex.category] = (cats[ex.category] || 0) + 1
    rels[ex.labels.relationship] = (rels[ex.labels.relationship] || 0) + 1
    buyers[ex.labels.buyerRequest] = (buyers[ex.labels.buyerRequest] || 0) + 1
    msgs[ex.labels.messageEligible] = (msgs[ex.labels.messageEligible] || 0) + 1
  }

  return {
    total: FROZEN_EVAL_SET.length,
    categories: cats,
    relationships: rels,
    buyerRequests: buyers,
    messageEligible: msgs,
  }
}
