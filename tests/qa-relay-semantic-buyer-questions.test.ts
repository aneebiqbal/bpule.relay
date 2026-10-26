/**
 * REL-QA-009 — semantic buyer-question coverage.
 *
 * The gate must catch paraphrases, compound asks and implicit asks, and must
 * NOT treat marketing copy, seller offers, job-seeking text, quoted customer
 * language, historic questions or testimonial quotes as live buyer requests.
 *
 * Each case asserts the canonical request type AND its answerability, so a
 * future change cannot silently reclassify a calendar-backed ask as answerable.
 */
import { describe, expect, it } from 'vitest'
import {
  answerabilityFor,
  assessReplyPlan,
  buildReplyPlan,
  decideMessageQuality,
  extractBuyerRequests,
  hasInventedAvailability,
  type BuyerRequestType,
} from '@/lib/relay/buyer-request-plan'

interface PositiveCase {
  name: string
  message: string
  expect: BuyerRequestType[]
}

const POSITIVE: PositiveCase[] = [
  // ── Experience / case study ──────────────────────────────────────────────
  { name: 'EXPERIENCE_DIRECT', message: 'What relevant experience do you have?', expect: ['EXPERIENCE'] },
  { name: 'EXPERIENCE_PARAPHRASE', message: 'Have you built anything similar?', expect: ['CASE_STUDY'] },
  { name: 'EXPERIENCE_BEFORE', message: 'Have you done this before?', expect: ['CASE_STUDY'] },
  { name: 'EXPERIENCE_SHIPPED', message: 'What similar systems have you shipped?', expect: ['CASE_STUDY'] },
  { name: 'EXPERIENCE_ANY', message: 'Any relevant projects?', expect: ['CASE_STUDY'] },
  { name: 'EXPERIENCE_KEYWORD', message: 'Do you have experience with warehouse management?', expect: ['EXPERIENCE'] },
  { name: 'CASE_STUDY_EXPLICIT', message: 'Can you share some relevant case studies?', expect: ['CASE_STUDY'] },
  { name: 'CASE_STUDY_PORTFOLIO', message: 'Do you have a portfolio we could look at?', expect: ['CASE_STUDY'] },
  { name: 'CASE_STUDY_LIKE_THIS', message: 'Have you built anything like this before?', expect: ['CASE_STUDY'] },
  { name: 'EXPERIENCE_MIGRATION', message: 'Curious whether your team has handled this kind of migration.', expect: ['EXPERIENCE'] },

  // ── Technical approach ───────────────────────────────────────────────────
  { name: 'APPROACH_HOW', message: 'How would you approach this?', expect: ['TECHNICAL_APPROACH'] },
  { name: 'APPROACH_PROCESS', message: "What's your process for a build like this?", expect: ['TECHNICAL_APPROACH'] },
  { name: 'APPROACH_ARCHITECTURE', message: 'Can you walk me through your architecture?', expect: ['TECHNICAL_APPROACH'] },

  // ── Delivery timeline ────────────────────────────────────────────────────
  { name: 'TIMELINE_QUICKLY', message: 'How quickly can you get this live?', expect: ['DELIVERY_TIMELINE'] },
  { name: 'TIMELINE_LOOK_LIKE', message: 'What would delivery look like?', expect: ['DELIVERY_TIMELINE'] },
  { name: 'TIMELINE_LONG', message: 'Roughly how long would delivery take?', expect: ['DELIVERY_TIMELINE'] },
  { name: 'TIMELINE_TURNAROUND', message: "What's the turnaround time?", expect: ['DELIVERY_TIMELINE'] },
  { name: 'TIMELINE_DURATION', message: 'What is the expected duration?', expect: ['DELIVERY_TIMELINE'] },
  { name: 'TIMELINE_DEADLINE', message: 'Can you hit a deadline of March 15?', expect: ['DELIVERY_TIMELINE'] },

  // ── Start date ───────────────────────────────────────────────────────────
  { name: 'START_WHEN', message: 'When could your team start?', expect: ['START_DATE'] },
  { name: 'START_NEXT_MONTH', message: 'Can you start next month?', expect: ['START_DATE'] },
  { name: 'START_ASAP', message: 'How soon could you kick off?', expect: ['START_DATE'] },

  // ── Team availability ────────────────────────────────────────────────────
  { name: 'CAPACITY_TEAM', message: 'Is your team available for this?', expect: ['TEAM_AVAILABILITY'] },
  { name: 'CAPACITY_QUARTER', message: 'Do you have capacity next quarter?', expect: ['TEAM_AVAILABILITY'] },
  { name: 'CAPACITY_DEDICATED', message: 'Could you dedicate a team to this?', expect: ['TEAM_AVAILABILITY'] },

  // ── Meeting availability (calendar-backed) ────────────────────────────────
  { name: 'MEETING_SPEAK', message: 'Could your team speak sometime next week?', expect: ['MEETING_AVAILABILITY'] },
  { name: 'MEETING_AROUND', message: 'Are you around for a call tomorrow?', expect: ['MEETING_AVAILABILITY'] },
  { name: 'MEETING_SPECIFIC', message: 'Are you free Tuesday at 3?', expect: ['MEETING_AVAILABILITY'] },
  { name: 'MEETING_BOOK', message: 'Can we book a time to discuss?', expect: ['MEETING_AVAILABILITY'] },

  // ── Pricing ──────────────────────────────────────────────────────────────
  { name: 'PRICING_ROUGH', message: 'Can you share rough pricing?', expect: ['PRICING'] },
  { name: 'PRICING_COST', message: 'What would this cost?', expect: ['PRICING'] },
  { name: 'PRICING_MUCH', message: 'How much are you charging?', expect: ['PRICING'] },
  { name: 'PRICING_QUOTE', message: 'Could you send over a quote?', expect: ['PRICING'] },

  // ── Budget ───────────────────────────────────────────────────────────────
  { name: 'BUDGET_KIND', message: 'What kind of budget would this take?', expect: ['BUDGET'] },
  { name: 'BUDGET_MIND', message: 'Do you have a budget in mind?', expect: ['BUDGET'] },
  { name: 'BUDGET_APPROVED', message: 'We have an approved budget — what can you do with it?', expect: ['BUDGET'] },

  // ── Rate ─────────────────────────────────────────────────────────────────
  { name: 'RATE_HOURLY', message: "What's your hourly rate?", expect: ['RATE'] },
  { name: 'RATE_PER_HOUR', message: 'What do you charge per hour?', expect: ['RATE'] },
  { name: 'RATE_DAY', message: 'Do you have a day rate?', expect: ['RATE'] },

  // ── Estimate ─────────────────────────────────────────────────────────────
  { name: 'ESTIMATE_ROUGH', message: 'Can you give us a rough estimate?', expect: ['ESTIMATE'] },
  { name: 'ESTIMATE_BALLPARK', message: "What's the ballpark?", expect: ['ESTIMATE'] },
  { name: 'ESTIMATE_APPROX', message: 'Could you approximate the cost?', expect: ['ESTIMATE'] },

  // ── Proposal ─────────────────────────────────────────────────────────────
  { name: 'PROPOSAL_FORMAL', message: 'Could you send something formal?', expect: ['PROPOSAL'] },
  { name: 'PROPOSAL_DOC', message: 'Can you share a proposal?', expect: ['PROPOSAL'] },
  { name: 'PROPOSAL_RFP', message: 'Would you respond to an RFP?', expect: ['PROPOSAL'] },

  // ── Scope ────────────────────────────────────────────────────────────────
  { name: 'SCOPE_INCLUDED', message: "What's included in the scope?", expect: ['SCOPE'] },
  { name: 'SCOPE_DELIVERABLES', message: 'What are the deliverables?', expect: ['SCOPE'] },
  { name: 'SCOPE_OUT', message: 'What is out of scope?', expect: ['SCOPE'] },

  // ── Team size ────────────────────────────────────────────────────────────
  { name: 'SIZE_PEOPLE', message: 'How many people would be on this?', expect: ['TEAM_SIZE'] },
  { name: 'SIZE_TEAM', message: "What's the team size?", expect: ['TEAM_SIZE'] },
  { name: 'SIZE_WHO', message: 'Who would work on this?', expect: ['TEAM_SIZE'] },

  // ── Location ─────────────────────────────────────────────────────────────
  { name: 'LOCATION_BASED', message: 'Where is your team based?', expect: ['LOCATION'] },
  { name: 'LOCATION_REMOTE', message: 'Are you remote or on-site?', expect: ['LOCATION'] },
  { name: 'LOCATION_COUNTRY', message: 'Which country are you in?', expect: ['LOCATION'] },

  // ── Timezone ─────────────────────────────────────────────────────────────
  { name: 'TIMEZONE_WHAT', message: 'What timezone are you in?', expect: ['TIMEZONE'] },
  { name: 'TIMEZONE_OVERLAP', message: 'Do you have overlap with EST?', expect: ['TIMEZONE'] },
  { name: 'TIMEZONE_UTC', message: 'Are you on UTC?', expect: ['TIMEZONE'] },

  // ── Security ─────────────────────────────────────────────────────────────
  { name: 'SECURITY_SOC2', message: 'Are you SOC 2 compliant?', expect: ['SECURITY'] },
  { name: 'SECURITY_DATA', message: 'How do you handle data security?', expect: ['SECURITY'] },
  { name: 'SECURITY_PENTEST', message: 'Have you had a pen test?', expect: ['SECURITY'] },

  // ── Compliance ───────────────────────────────────────────────────────────
  { name: 'COMPLIANCE_GDPR', message: 'Do you meet GDPR requirements?', expect: ['COMPLIANCE'] },
  { name: 'COMPLIANCE_HIPAA', message: 'Are you HIPAA compliant?', expect: ['COMPLIANCE'] },
  { name: 'COMPLIANCE_AUDIT', message: 'Can you pass a compliance audit?', expect: ['COMPLIANCE'] },

  // ── NDA ──────────────────────────────────────────────────────────────────
  { name: 'NDA_SIGN', message: 'Would you sign an NDA?', expect: ['NDA'] },
  { name: 'NDA_PLACE', message: 'Can we get an NDA in place?', expect: ['NDA'] },

  // ── Integration ──────────────────────────────────────────────────────────
  { name: 'INTEGRATION_SALESForce', message: 'Can you integrate with Salesforce and NetSuite?', expect: ['INTEGRATION'] },
  { name: 'INTEGRATION_HUBSPOT', message: 'Do you work with our HubSpot?', expect: ['INTEGRATION'] },
  { name: 'INTEGRATION_API', message: 'Can you connect to our API?', expect: ['INTEGRATION'] },

  // ── Tech stack ───────────────────────────────────────────────────────────
  { name: 'STACK_REACT', message: 'Do you work with React and Node?', expect: ['TECH_STACK'] },
  { name: 'STACK_WHAT', message: "What's your tech stack?", expect: ['TECH_STACK'] },
  { name: 'STACK_PYTHON', message: 'Are you comfortable with Python and Postgres?', expect: ['TECH_STACK'] },

  // ── Support ──────────────────────────────────────────────────────────────
  { name: 'SUPPORT_POST', message: 'What does post-launch support look like?', expect: ['SUPPORT'] },
  { name: 'SUPPORT_WARRANTY', message: 'Do you offer a warranty?', expect: ['SUPPORT'] },
  { name: 'SUPPORT_SLA', message: 'What SLA do you provide?', expect: ['SUPPORT'] },

  // ── References ───────────────────────────────────────────────────────────
  { name: 'REFERENCES_SHARE', message: 'Can you share references?', expect: ['REFERENCES'] },
  { name: 'REFERENCES_TESTIMONIAL', message: 'Do you have testimonials?', expect: ['REFERENCES'] },
  { name: 'REFERENCES_CLIENTS', message: 'Who else have you worked with?', expect: ['REFERENCES'] },

  // ── Next step ────────────────────────────────────────────────────────────
  { name: 'NEXT_STEPS', message: 'What are the next steps?', expect: ['NEXT_STEP'] },
  { name: 'NEXT_PROCEED', message: 'How do we proceed?', expect: ['NEXT_STEP'] },
  { name: 'NEXT_CALL', message: 'Can we set up a call to discuss next steps?', expect: ['NEXT_STEP'] },

  // ── Compound asks ────────────────────────────────────────────────────────
  { name: 'COMPOUND_EXP_TIMELINE', message: 'Have you built anything similar and how long would this take?', expect: ['CASE_STUDY', 'DELIVERY_TIMELINE'] },
  { name: 'COMPOUND_PRICE_START', message: 'Can you send pricing and tell me if your team can start next month?', expect: ['PRICING', 'START_DATE'] },
  { name: 'COMPOUND_THREE', message: 'Share relevant experience, expected timeline, and availability next week.', expect: ['EXPERIENCE', 'DELIVERY_TIMELINE', 'MEETING_AVAILABILITY'] },
  { name: 'COMPOUND_CASE_TIMELINE', message: 'Can you share some relevant case studies, and roughly how long would delivery take?', expect: ['CASE_STUDY', 'DELIVERY_TIMELINE'] },
  { name: 'COMPOUND_TECH_TEAM', message: 'Do you work with React, and how many people would be on the project?', expect: ['TECH_STACK', 'TEAM_SIZE'] },

  // ── Implicit asks (no question mark) ─────────────────────────────────────
  { name: 'IMPLICIT_DELIVERY', message: 'Would be useful to understand what delivery typically looks like.', expect: ['DELIVERY_TIMELINE'] },
  { name: 'IMPLICIT_EXPERIENCE', message: "We'd love to see some previous work.", expect: ['CASE_STUDY'] },
  { name: 'IMPLICIT_PRICING', message: 'Please share your pricing.', expect: ['PRICING'] },
  { name: 'IMPLICIT_PROPOSAL', message: 'Let us know if you can send a proposal.', expect: ['PROPOSAL'] },
  { name: 'IMPLICIT_INTEGRATION', message: 'Interested to know whether you can integrate with Salesforce.', expect: ['INTEGRATION'] },
]

interface NegativeCase {
  name: string
  message: string
}

const NEGATIVE: NegativeCase[] = [
  { name: 'MARKETING_COPY', message: 'We are hiring! Join our team of engineers and build the future of fintech.' },
  { name: 'SELLER_OFFER', message: 'We build custom CRM integrations for startups. Request services on our website.' },
  { name: 'JOB_SEEKING', message: "I'm open to new opportunities as a React developer." },
  { name: 'QUOTED_CUSTOMER', message: "A client told us: 'we need a new website'." },
  { name: 'HISTORIC_QUESTION', message: 'Last year we asked about pricing, but we went in a different direction.' },
  { name: 'TESTIMONIAL_QUOTE', message: "'Great team, delivered on time' — Acme Corp" },
  { name: 'STATEMENT_OF_FACT', message: 'Our approved budget is $85,000 and we start in February.' },
  { name: 'SELF_PROMOTION', message: 'We just shipped automated EU AI Act gap reports. Book a demo.' },
  { name: 'RECRUITER_OFFER', message: 'We help companies hire React developers. Open to a chat?' },
  { name: 'GENERIC_GREETING', message: 'Thanks for connecting, great to be in touch.' },
  { name: 'PAST_ENGAGEMENT', message: 'We worked with an agency in 2023 on a similar build.' },
  { name: 'NON_REQUEST_QUESTION', message: 'Did you see the game last night?' },
]

describe('REL-QA-009 semantic coverage — positive paraphrases', () => {
  it.each(POSITIVE)('$name: extracts $expect', ({ message, expect: expected }) => {
    const requests = extractBuyerRequests(message)
    expect(requests.map((r) => r.type).sort(), message).toEqual([...expected].sort())
  })
})

describe('REL-QA-009 semantic coverage — negative cases', () => {
  it.each(NEGATIVE)('$name: extracts no buyer request', ({ message }) => {
    expect(extractBuyerRequests(message), message).toEqual([])
  })
})

describe('REL-QA-009 answerability', () => {
  it('calendar-backed asks are UNSAFE_TO_INVENT', () => {
    expect(answerabilityFor('MEETING_AVAILABILITY')).toBe('UNSAFE_TO_INVENT')
    expect(answerabilityFor('TEAM_AVAILABILITY')).toBe('UNSAFE_TO_INVENT')
    expect(answerabilityFor('START_DATE')).toBe('UNSAFE_TO_INVENT')
  })

  it('a calendar ask is never answered by naming a slot', () => {
    const requests = extractBuyerRequests('Are you free Tuesday at 3?')
    expect(requests[0]?.type).toBe('MEETING_AVAILABILITY')
    expect(requests[0]?.answerability).toBe('UNSAFE_TO_INVENT')

    const plan = buildReplyPlan(requests)
    expect(plan.prohibitedClaims.join(' ')).toMatch(/meeting day or time/i)

    // Coordinating is the safe answer; naming a slot is a blocker.
    const safe = assessReplyPlan(plan, 'I can coordinate a time next week.')
    expect(safe.complete).toBe(true)
    const unsafe = decideMessageQuality(assessReplyPlan(plan, 'Yes — Tuesday at 3pm works.'), {
      inventedAvailability: hasInventedAvailability('Yes — Tuesday at 3pm works.'),
    })
    expect(unsafe.sendable).toBe(false)
  })
})

describe('REL-QA-009 completeness gate', () => {
  const MESSAGE = 'Can you share relevant experience, the expected timeline, and whether your team is free next week?'

  it('a reply that covers every request is sendable', () => {
    const plan = buildReplyPlan(extractBuyerRequests(MESSAGE))
    const decision = decideMessageQuality(
      assessReplyPlan(plan, 'We have delivered similar systems before. The timeline is about 10 weeks. I can coordinate a time next week.'),
    )
    expect(decision.sendable).toBe(true)
    expect(decision.questionCoverage).toBe(1)
  })

  it('a reply that omits a request is blocked', () => {
    const plan = buildReplyPlan(extractBuyerRequests(MESSAGE))
    const decision = decideMessageQuality(assessReplyPlan(plan, 'Thanks for the note — we have delivered similar systems before.'))
    expect(decision.sendable).toBe(false)
    expect(decision.blockers.join(' ')).toMatch(/unanswered buyer request/i)
  })

  it('a reply that invents a slot is blocked even when it covers the rest', () => {
    const plan = buildReplyPlan(extractBuyerRequests(MESSAGE))
    const draft = 'We have delivered similar systems before. The timeline is about 10 weeks. Tuesday at 2pm works.'
    const decision = decideMessageQuality(assessReplyPlan(plan, draft), { inventedAvailability: hasInventedAvailability(draft) })
    expect(decision.sendable).toBe(false)
    expect(decision.blockers.join(' ')).toMatch(/invents a calendar slot/i)
  })
})
