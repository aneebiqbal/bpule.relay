/**
 * Relay historical bug corpus (Phases 6–7).
 *
 * One named fixture per important production failure, with a typed schema and a
 * single runner. The runner executes every applicable invariant, so a regression
 * in any fixture fails CI by name instead of being rediscovered by a QA person.
 *
 * Invariants are deterministic: they run in CI with no provider key. Fixtures
 * whose expectation needs the model (extraction facts, buyer intent) are marked
 * `needsModel: true` and are reported, never silently skipped.
 */

import type { LeadAction } from '@/lib/relay/lead-state-machine'
import type { ConversationPresence, RelationshipDisplayState } from '@/lib/relay/conversation-presence'
import type { BuyerRequestType } from '@/lib/relay/buyer-request-plan'

export interface RelayRegressionExpectation {
  /** Canonical next action for the lead state. */
  action?: LeadAction
  /** Whether the lead requires action from the rep. */
  requiresAction?: boolean
  /** Canonical relationship display state. */
  relationship?: RelationshipDisplayState
  /** Canonical conversation presence. */
  presence?: ConversationPresence
  /** Whether the messaging policy recommends a message. */
  messageRecommended?: boolean
  /** Canonical score text, when the fixture carries a score. */
  scoreText?: string
  /** Missing numeric fields must be null, never 0. */
  unknownNotZero?: boolean
  /** Buyer request types the client message must yield. */
  buyerRequests?: BuyerRequestType[]
}

export interface RelayRegressionFixture {
  id: string
  /** Human summary of the original failure. */
  symptom: string
  source: string
  /** True when the expectation needs the model and cannot run in CI. */
  needsModel?: boolean
  expected: RelayRegressionExpectation
  /** Contracts this fixture guards. */
  contracts: number[]
}

const AVIGAIL = `Avigail Eisenstadt
Founder & CEO at AE Design Group, LLC
Interior design and space planning for residential and commercial clients.
About
AE Design Group creates considered interiors for homes and workplaces.
We are a small studio handling full-home renovations and commercial fit-outs.
Previously led operations for a nonprofit emergency medical team.
Request services at aedesign.example.`

const BRIAN = `Brian Maccaba
· 2nd

CEO at Bio-marker.ai


Bio-marker.ai is a biomarker discovery platform.
We are building ML models to identify early-stage disease markers.
Remote/Hybrid — United Kingdom, Israel
Experience
CEO, Bio-marker.ai · Full-time
Jan 2023 - Present
Building a biomarker discovery platform.`

const DARIA = `Daria Redkina
Founder of Solsonic
Building a marketplace for independent music licensing.
We are looking for an external development team to build our licensing platform.
Budget approved: $60,000. Start within 6 weeks.`

const ELIJAH = `Elijah Gutman
CEO at Hartford AI Partners
Hartford AI Partners is an AI implementation consultancy.
We sell AI consulting, custom automations, AI agents, AI training and IT consulting.
Request services or try our product at hartford-ai.example.`

const DANIEL = `Daniel Protopopov
CEO at Pipeform
Pipeform is a recruiting platform for technical talent.
We help companies hire engineers.
Previously built a billing product at Northgate.
Request services at pipeform.example.`

const ABDULHAKIM = `Abdulhakim Sheik
Founder at Tayo360
Tayo360 is a logistics platform for West African freight.
We are building a freight marketplace and fleet management tool.
We are looking for an external engineering team to help build our mobile apps.
Budget approved: $120,000.`

/** Explicit buyer: a current, prospect-owned request for outside help. */
const NADIA = `Nadia Rahman
CTO at Meridian Logistics
Meridian runs a fleet of 400 vehicles.
We need an external software team to rebuild our dispatch platform in React and Node.
Budget approved: $90,000. Start within 4 weeks.`

const HANNAH = `Hannah Cole
VP Operations at Northwind Retail
Northwind operates 60 stores.
We are looking for an external agency to build a new inventory system.
Budget approved: $75,000.`

const EMMA = `Emma Lindqvist
Head of Digital at Fjord Bank
Fjord Bank is modernizing its customer portal.
We want to engage an external partner to rebuild our portal.
Budget approved: €85,000.`

/** Terminal: the client opted out after earlier positive signals. */
const ETHAN = `Ethan Walsh
CTO at Brightline
Brightline is a logistics software company.
We are looking for an external team to build a new tracking dashboard.
Budget approved: $50,000.`

const JURICA = `Jurica Novak
Freelance Consultant
Independent consultant advising startups on go-to-market.
We help early-stage companies with positioning and pricing.
Open to collaborations.`

/** Inbound-first: the client opened the conversation. */
const INBOUND_FIRST = `We need an external team to rebuild our booking platform. Budget approved: $45,000.`

export const RELAY_REGRESSION_CORPUS: readonly RelayRegressionFixture[] = [
  {
    id: 'HARDENING_AVIGAIL',
    symptom: 'A non-software CEO/Founder was sent a connection note and her remote eligibility read UNCLEAR instead of NOT_APPLICABLE.',
    source: AVIGAIL,
    expected: { messageRecommended: false, unknownNotZero: true },
    contracts: [2, 6],
  },
  {
    id: 'HARDENING_BRIAN',
    symptom: 'Role and employer were merged into the title, and historical locations became current engagement restrictions.',
    source: BRIAN,
    expected: { messageRecommended: false },
    contracts: [1, 2],
  },
  {
    id: 'HARDENING_DARIA',
    symptom: 'Company name was null despite repeated explicit company evidence; an empty draft crashed.',
    source: DARIA,
    expected: { unknownNotZero: true },
    contracts: [1, 6],
  },
  {
    id: 'HARDENING_ELIJAH',
    symptom: 'A capability-overlap seller was read as a buyer with MEDIUM intent.',
    source: ELIJAH,
    expected: { messageRecommended: false, unknownNotZero: true },
    contracts: [2, 4],
  },
  {
    id: 'HARDENING_DANIEL',
    symptom: 'A recruiting platform seller was read as a buyer.',
    source: DANIEL,
    expected: { messageRecommended: false },
    contracts: [2, 4],
  },
  {
    id: 'HARDENING_ABDULHAKIM',
    symptom: 'A genuine builder was under-prioritised; the builder path needs product/technical evidence.',
    source: ABDULHAKIM,
    expected: { messageRecommended: true, unknownNotZero: true },
    contracts: [2, 6],
  },
  {
    id: 'NADIA_EXPLICIT_BUYER',
    symptom: 'An explicit buyer was downgraded because the model scored the request low.',
    source: NADIA,
    expected: { messageRecommended: true },
    contracts: [4, 2],
  },
  {
    id: 'HANNAH_EXPLICIT_BUYER',
    symptom: 'A quoted buyer request was not treated as a verified request.',
    source: HANNAH,
    expected: { messageRecommended: true },
    contracts: [4],
  },
  {
    id: 'EMMA_EXTERNAL_REQUEST',
    symptom: 'An external request was quoted in evidence but still reported as no verified request.',
    source: EMMA,
    expected: { messageRecommended: true },
    contracts: [4],
  },
  {
    id: 'ETHAN_TERMINAL_OPT_OUT',
    symptom: 'A terminal opt-out did not suppress outreach.',
    source: ETHAN,
    expected: { action: 'CLOSED', requiresAction: false },
    contracts: [5],
  },
  {
    id: 'JURICA_LOW_PRIORITY',
    symptom: 'A low-priority consultant was given a buyer path.',
    source: JURICA,
    expected: { messageRecommended: false },
    contracts: [2, 4],
  },
  {
    id: 'INBOUND_FIRST_LEAD',
    symptom: 'An inbound-first lead was filed as To Contact while the detail said Needs Reply.',
    source: INBOUND_FIRST,
    expected: { action: 'SEND_REPLY', requiresAction: true, presence: 'UNVERIFIED_THREAD' },
    contracts: [3],
  },
  {
    id: 'NO_THREAD',
    symptom: 'A lead with no conversation read as having one.',
    source: 'Sarah Chen\nVP Engineering at Acme\nHiring engineers for a new platform.',
    expected: { presence: 'NO_MESSAGES', action: 'SEND_CONNECTION', requiresAction: true },
    contracts: [3],
  },
  {
    id: 'UNVERIFIED_THREAD',
    symptom: 'A thread with no verified turn was treated as verified.',
    source: 'Marcus Webb\nCTO at Northgate\nWe are evaluating partners for a rebuild.',
    expected: { presence: 'NO_MESSAGES', action: 'SEND_CONNECTION', requiresAction: true },
    contracts: [3],
  },
  {
    id: 'STALE_SCORE',
    symptom: 'A stale qualification was hidden instead of reported.',
    source: 'Priya Raman\nCTO at Ledgerline\nWe need an external team to rebuild our dashboard.',
    expected: { unknownNotZero: true },
    contracts: [3, 6],
  },
  {
    id: 'UPWORK_UNKNOWN_CONNECTS',
    symptom: 'Missing Connects rendered as 0 instead of not stated.',
    source: 'Senior React Native Engineer\nHourly\n$5.00 - $15.00\nExpert\nMore than 6 months',
    expected: { unknownNotZero: true },
    contracts: [6],
  },
  {
    id: 'UPWORK_FIXED_BUDGET',
    symptom: 'A monthly rate was extracted as a fixed budget.',
    source: 'Backend Engineer\nFixed price: $5000\nMore than 3 months',
    expected: { unknownNotZero: true },
    contracts: [6],
  },
  {
    id: 'STUDIO_REGEN_FAILURE',
    symptom: 'A failed Studio regeneration destroyed the existing image.',
    source: 'Studio image regeneration failure',
    expected: { unknownNotZero: true },
    contracts: [7],
  },
  {
    id: 'MULTI_QUESTION_BUYER',
    symptom: 'A reply answered one of three explicit questions.',
    source: 'Can you share relevant experience, the expected timeline, and whether your team is free next week?',
    expected: { buyerRequests: ['EXPERIENCE', 'DELIVERY_TIMELINE', 'TEAM_AVAILABILITY'] },
    contracts: [3, 7],
  },
  {
    id: 'PARAPHRASED_BUYER_QUESTION',
    symptom: 'A paraphrase of an experience question was classified as other and blocked a correct reply.',
    source: 'Have you built anything similar?',
    expected: { buyerRequests: ['CASE_STUDY'] },
    contracts: [4, 7],
  },
  {
    id: 'FAKE_PROOF',
    symptom: 'A proof card was claimed without a matching source fact.',
    source: 'We built a logistics platform for a national carrier.',
    expected: { unknownNotZero: true },
    contracts: [6, 7],
  },
]
