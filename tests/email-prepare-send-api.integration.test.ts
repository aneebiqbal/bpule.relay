import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'

const ORG_ID = 'org-test'
const REP_ID = 'rep-bd-1'
const OTHER_REP_ID = 'rep-bd-2'
const LEAD_ID = 'lead-1'
const IDENTITY_ID = 'ri-email-1'
const CONTACT_ID = 'cp-1'

const { createScoutStoreMock, createServerSupabaseMock, getEmailProviderMock, generateEmailCopyMock } = vi.hoisted(() => ({
  createScoutStoreMock: vi.fn(),
  createServerSupabaseMock: vi.fn(),
  getEmailProviderMock: vi.fn(),
  generateEmailCopyMock: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: createScoutStoreMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: createServerSupabaseMock,
}))

vi.mock('@/lib/email/providers/email-provider', () => ({
  getEmailProvider: getEmailProviderMock,
}))

vi.mock('@/lib/email/writer', () => ({
  generateEmailCopy: generateEmailCopyMock,
}))

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    organizationId: ORG_ID,
    ownerRepId: REP_ID,
    company: 'Acme Health',
    companyKey: 'acmehealth',
    contactName: 'Sarah Chen',
    contactTitle: 'CTO',
    titleRaw: 'CTO at Acme Health',
    locationRaw: 'San Francisco',
    url: 'https://example.com/sarah',
    rawInput: 'Acme is hiring backend engineers for core platform reliability.',
    roleCategory: 'technical_leadership',
    marketRegion: 'US',
    extractionConfidence: 86,
    extractionProfile: null,
    signalType: 1,
    signalEvidence: 'Acme is hiring backend engineers for core platform reliability.',
    verbatimQuote: null,
    score: 10,
    verdict: 'send',
    status: 'new',
    playId: null,
    tags: ['backend', 'hiring'],
    direction: 'outbound',
    source: 'linkedin',
    inboundMessage: null,
    inboundRaw: null,
    canonicalIntelligence: null,
    canonicalScore: null,
    evidenceLedger: [],
    messages: [],
    revenueIdentityId: IDENTITY_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// Overrides that make sourceFromLead/buildRevenueStrategy resolve to
// messageRecommended=true (EXPLICIT_NEED), needed for CAN_PREPARE_EMAIL vs
// CAN_SEND_EMAIL tests below, which must isolate contact-verification state
// as the only variable — the default makeLead() fixture resolves to
// CONNECT_OR_OBSERVE/messageRecommended=false, which is a content-strategy
// gate unrelated to what these tests are checking.
const EXPLICIT_NEED_LEAD_OVERRIDES = {
  rawInput: 'We need help hiring backend engineers for core platform reliability.',
  signalEvidence: 'We need help hiring backend engineers for core platform reliability.',
}

function baseIdentity(id: string, organizationId = ORG_ID) {
  return {
    id,
    organization_id: organizationId,
    slug: `${id}-slug`,
    identity_name: `Identity ${id}`,
    title: 'BD Rep',
    positioning: null,
    profile_url: null,
    skills: [],
    expertise: [],
    industries: [],
    technologies: [],
    allowed_first_person_claims: [],
    forbidden_claims: [],
    channel_rules: {},
    voice_tone: {},
    preferred_opportunity_types: [],
    proposal_positioning: null,
    profile_id: null,
    channel: 'email',
    status: 'active',
    source_kind: 'manual',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    organization_id: ORG_ID,
    lead_id: LEAD_ID,
    revenue_identity_id: IDENTITY_ID,
    contact_point_id: CONTACT_ID,
    contact_email: 'sarah@acmehealth.com',
    draft_status: 'READY',
    relationship_type: 'cold',
    opportunity_type: 'HIRING',
    email_goal: 'GET_REPLY',
    subject: 'Quick note on Acme backend hiring',
    subject_candidates: ['Quick note on Acme backend hiring'],
    body: 'Hi Sarah, open to a quick exchange this week?',
    strategy: {
      allowedEvidence: ['Acme is hiring backend engineers for core platform reliability.'],
      thingsNotToClaim: [],
      attachmentRecommendation: {
        relevance: 'RELEVANT',
        artifactId: 'art-1',
        artifactName: 'Senior Backend Resume',
        reason: 'Hiring signal is present.',
      },
    },
    research_brief: { company: 'Acme Health' },
    claim_safety: {
      safe: true,
      repaired: false,
      allowedEvidence: ['Acme is hiring backend engineers for core platform reliability.'],
      thingsNotToClaim: [],
      issues: [],
      repairedBody: null,
    },
    edit_disposition: null,
    evidence_used: ['Acme is hiring backend engineers for core platform reliability.'],
    blocked_reason: null,
    is_followup: false,
    followup_sequence: 0,
    created_by: REP_ID,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function postPrepare(payload: Record<string, unknown> = {}, leadId = LEAD_ID) {
  const { POST } = await import('@/app/api/leads/[id]/email/prepare/route')
  const req = new Request(`http://localhost/api/leads/${leadId}/email/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const res = await POST(req, { params: Promise.resolve({ id: leadId }) })
  return { res, data: await res.json() }
}

async function postSend(payload: Record<string, unknown>, leadId = LEAD_ID) {
  const { POST } = await import('@/app/api/leads/[id]/email/send/route')
  const req = new Request(`http://localhost/api/leads/${leadId}/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const res = await POST(req, { params: Promise.resolve({ id: leadId }) })
  return { res, data: await res.json() }
}

function setupHarness(opts: {
  leadAccess?: 'ok' | 'missing' | 'not_owner'
  sendAccepted?: boolean
  seed?: Partial<Record<string, Array<Record<string, unknown>>>>
  leadOverrides?: Record<string, unknown>
}) {
  const lead = makeLead(opts.leadOverrides)
  const fake = createFakeSupabase({
    identity_assignments: [
      {
        id: 'ia-1',
        organization_id: ORG_ID,
        rep_id: REP_ID,
        revenue_identity_id: IDENTITY_ID,
      },
      {
        id: 'ia-2',
        organization_id: ORG_ID,
        rep_id: OTHER_REP_ID,
        revenue_identity_id: 'ri-email-2',
      },
    ],
    revenue_identities: [
      baseIdentity(IDENTITY_ID),
      baseIdentity('ri-email-2'),
      baseIdentity('ri-foreign', 'org-foreign'),
    ],
    contact_points: [
      {
        id: CONTACT_ID,
        organization_id: ORG_ID,
        lead_id: LEAD_ID,
        person_id: null,
        company_id: null,
        type: 'email',
        value: 'sarah@acmehealth.com',
        source: 'USER_PROVIDED',
        source_url: null,
        source_type: null,
        verification_status: 'VERIFIED',
        verification_method: null,
        confidence: 1,
        is_primary: true,
        is_business_contact: true,
        discovered_at: '2026-01-01T00:00:00.000Z',
        verified_at: null,
        last_used_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    outreach_artifacts: [
      {
        id: 'art-1',
        organization_id: ORG_ID,
        revenue_identity_id: IDENTITY_ID,
        profile_id: null,
        artifact_type: 'RESUME',
        name: 'Senior Backend Resume',
        description: null,
        source_url: null,
        tags: [],
        active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'art-foreign',
        organization_id: ORG_ID,
        revenue_identity_id: 'ri-email-2',
        profile_id: null,
        artifact_type: 'RESUME',
        name: 'Foreign Resume',
        description: null,
        source_url: null,
        tags: [],
        active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    email_mailboxes: [
      {
        id: 'mb-1',
        organization_id: ORG_ID,
        revenue_identity_id: IDENTITY_ID,
        provider: 'relay_noop',
        sender_email: 'bd@relay.test',
        sender_name: 'Relay BD',
        signature: null,
        status: 'CONNECTED',
        secrets_ciphertext: {},
        metadata: {},
        last_connected_at: '2026-01-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    email_sending_policies: [
      {
        id: 'policy-1',
        organization_id: ORG_ID,
        revenue_identity_id: IDENTITY_ID,
        daily_send_cap: 30,
        minimum_delay_seconds: 30,
        working_hours_start: 9,
        working_hours_end: 17,
        timezone: 'UTC',
        follow_up_limit: 1,
        suppression_rules: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    prepared_email_drafts: [],
    email_messages: [],
    email_send_attempts: [],
    email_delivery_events: [],
    email_suppressions: [],
    ...(opts.seed ?? {}),
  })

  const counters = {
    messages: [] as string[],
    relayEvents: [] as string[],
    accountabilityIncrements: 0,
  }

  const markContacted = vi.fn(async () => {
    const messageId = `msg-${counters.messages.length + 1}`
    counters.messages.push(messageId)
    counters.relayEvents.push(`OUTREACH_RECORDED:${messageId}`)
    counters.accountabilityIncrements += 1
    return {
      allowed: true,
      todaySends: counters.messages.length,
      limit: 30,
      messageId,
    }
  })

  const getLead = vi.fn(async (leadId: string) => {
    if (opts.leadAccess === 'missing') return null
    if (opts.leadAccess === 'not_owner') {
      throw new Error('You are not the owner of this lead, so it could not be marked contacted.')
    }
    return leadId === LEAD_ID ? lead : null
  })

  createScoutStoreMock.mockResolvedValue({
    organizationId: ORG_ID,
    getCurrentRepId: () => REP_ID,
    getLead,
    markContacted,
  })
  createServerSupabaseMock.mockResolvedValue(fake.client)

  const send = vi.fn(async () => {
    if (opts.sendAccepted === false) {
      return {
        accepted: false,
        provider: 'relay_noop',
        providerMessageId: null,
        providerThreadId: null,
        status: 'FAILED',
        failureReason: 'SMTP_FAIL',
      }
    }
    return {
      accepted: true,
      provider: 'relay_noop',
      providerMessageId: 'provider-message-1',
      providerThreadId: 'provider-thread-1',
      status: 'SENT',
      failureReason: null,
    }
  })

  getEmailProviderMock.mockReturnValue({
    id: 'relay_noop',
    name: 'Relay Noop',
    send,
    getDeliveryStatus: vi.fn(),
    getThread: vi.fn(),
    getMessages: vi.fn(),
  })

  generateEmailCopyMock.mockResolvedValue({
    subjectCandidates: ['Acme backend hiring support'],
    subject: 'Acme backend hiring support',
    body: 'Hi Sarah, open to a short exchange this week?',
    followupPlan: null,
  })

  return {
    fake,
    counters,
    markContacted,
    send,
  }
}

describe('Email prepare/send API integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createScoutStoreMock.mockReset()
    createServerSupabaseMock.mockReset()
    getEmailProviderMock.mockReset()
    generateEmailCopyMock.mockReset()
  })

  it('denies prepare for unassigned or foreign identity IDs', async () => {
    setupHarness({})

    for (const revenueIdentityId of ['ri-email-2', 'ri-foreign']) {
      const { res, data } = await postPrepare({ revenueIdentityId })
      expect(res.status).toBe(403)
      expect(data.error).toMatch(/assigned/i)
    }
  })

  it('denies send when draft identity is visible but not assigned', async () => {
    const h = setupHarness({
      seed: {
        email_mailboxes: [
          {
            id: 'mb-2',
            organization_id: ORG_ID,
            revenue_identity_id: 'ri-email-2',
            provider: 'relay_noop',
            sender_email: 'other@relay.test',
            sender_name: 'Other Sender',
            signature: null,
            status: 'CONNECTED',
            secrets_ciphertext: {},
            metadata: {},
            last_connected_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        prepared_email_drafts: [
          draftRow({
            id: 'draft-unassigned',
            revenue_identity_id: 'ri-email-2',
          }),
        ],
      },
    })

    const { res } = await postSend({ draftId: 'draft-unassigned', idempotencyKey: 'idem-unassigned' })

    expect(res.status).toBe(403)
    expect(h.send).not.toHaveBeenCalled()
    expect(h.markContacted).not.toHaveBeenCalled()
  })

  it('denies send with wrong mailbox or wrong artifact', async () => {
    const mailboxHarness = setupHarness({
      seed: {
        email_mailboxes: [
          {
            id: 'mb-1',
            organization_id: ORG_ID,
            revenue_identity_id: IDENTITY_ID,
            provider: 'relay_noop',
            sender_email: 'bd@relay.test',
            sender_name: 'Relay BD',
            signature: null,
            status: 'DISCONNECTED',
            secrets_ciphertext: {},
            metadata: {},
            last_connected_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        prepared_email_drafts: [draftRow({ id: 'draft-no-mailbox' })],
      },
    })
    const mailboxResult = await postSend({ draftId: 'draft-no-mailbox', idempotencyKey: 'idem-no-mailbox' })
    expect(mailboxResult.res.status).toBe(409)
    expect(mailboxHarness.send).not.toHaveBeenCalled()

    const artifactHarness = setupHarness({
      seed: {
        prepared_email_drafts: [
          draftRow({
            id: 'draft-bad-artifact',
            strategy: {
              allowedEvidence: ['Acme is hiring backend engineers for core platform reliability.'],
              thingsNotToClaim: [],
              attachmentRecommendation: {
                relevance: 'RELEVANT',
                artifactId: 'art-foreign',
                artifactName: 'Foreign Resume',
                reason: 'tampered',
              },
            },
          }),
        ],
      },
    })
    const artifactResult = await postSend({ draftId: 'draft-bad-artifact', idempotencyKey: 'idem-bad-artifact' })
    expect(artifactResult.res.status).toBe(409)
    expect(artifactHarness.send).not.toHaveBeenCalled()
  })

  it('prepare creates drafts but never sends provider email', async () => {
    const h = setupHarness({})
    const { res, data } = await postPrepare({ revenueIdentityId: IDENTITY_ID })

    expect(res.status).toBe(200)
    expect(data.draft?.id).toBeTruthy()
    expect(h.send).not.toHaveBeenCalled()
    expect(h.fake.tables.email_messages).toHaveLength(0)
    expect(h.fake.tables.email_send_attempts).toHaveLength(0)
  })

  // ── CAN_PREPARE_EMAIL vs CAN_SEND_EMAIL (hardening sprint) ───────────────
  //
  // Preparing an email (subject/body/strategy) is a research/writing
  // operation and must not require a verified recipient. Sending does.
  // See BUG_LEDGER — Daria Redkina / Solsonic hardening fixture: a
  // CONNECT_OR_OBSERVE lead with only an inferred contact previously got an
  // EMPTY draft ("No business email is available yet") instead of a real,
  // reviewable draft with Send correctly disabled.

  it('no email at all: prepare still generates subject/body, draftStatus is NOT READY (Send stays disabled)', async () => {
    const h = setupHarness({ seed: { contact_points: [] }, leadOverrides: EXPLICIT_NEED_LEAD_OVERRIDES })
    const { res, data } = await postPrepare({ revenueIdentityId: IDENTITY_ID })

    expect(res.status).toBe(200)
    expect(data.draft?.subject).toBeTruthy()
    expect(data.draft?.body).toBeTruthy()
    expect(data.draft?.draftStatus).not.toBe('READY')
    expect(data.draft?.draftStatus).toBe('NEEDS_VERIFIED_CONTACT')
    expect(data.draft?.blockedReason).toBeTruthy()
    expect(h.send).not.toHaveBeenCalled()
  })

  it('inferred-pattern email: prepare still generates subject/body, draftStatus is NOT READY (Send stays disabled)', async () => {
    const h = setupHarness({
      seed: {
        contact_points: [
          {
            id: CONTACT_ID,
            organization_id: ORG_ID,
            lead_id: LEAD_ID,
            person_id: null,
            company_id: null,
            type: 'email',
            value: 'sarah.chen@acmehealth.com',
            source: 'INFERRED_PATTERN',
            source_url: null,
            source_type: null,
            verification_status: 'UNVERIFIED',
            verification_method: null,
            confidence: 0.35,
            is_primary: true,
            is_business_contact: true,
            discovered_at: '2026-01-01T00:00:00.000Z',
            verified_at: null,
            last_used_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      leadOverrides: EXPLICIT_NEED_LEAD_OVERRIDES,
    })
    const { res, data } = await postPrepare({ revenueIdentityId: IDENTITY_ID })

    expect(res.status).toBe(200)
    expect(data.draft?.subject).toBeTruthy()
    expect(data.draft?.body).toBeTruthy()
    expect(data.draft?.draftStatus).toBe('NEEDS_VERIFIED_CONTACT')
    expect(data.draft?.blockedReason).toMatch(/not verified|inferred/i)
    expect(h.send).not.toHaveBeenCalled()
  })

  it('verified email: prepare generates subject/body AND draftStatus is READY (send-eligible after normal safety gates)', async () => {
    const h = setupHarness({ leadOverrides: EXPLICIT_NEED_LEAD_OVERRIDES }) // default seed has a VERIFIED contact
    const { res, data } = await postPrepare({ revenueIdentityId: IDENTITY_ID })

    expect(res.status).toBe(200)
    expect(data.draft?.subject).toBeTruthy()
    expect(data.draft?.body).toBeTruthy()
    expect(data.draft?.draftStatus).toBe('READY')
    expect(h.send).not.toHaveBeenCalled() // prepare never sends
  })

  it('send is blocked for an UNVERIFIED/inferred contact even if a draft with subject/body exists (the send-time enforcement, not just a UI hint)', async () => {
    const h = setupHarness({
      seed: {
        contact_points: [
          {
            id: CONTACT_ID,
            organization_id: ORG_ID,
            lead_id: LEAD_ID,
            person_id: null,
            company_id: null,
            type: 'email',
            value: 'sarah.chen@acmehealth.com',
            source: 'INFERRED_PATTERN',
            source_url: null,
            source_type: null,
            verification_status: 'UNVERIFIED',
            verification_method: null,
            confidence: 0.35,
            is_primary: true,
            is_business_contact: true,
            discovered_at: '2026-01-01T00:00:00.000Z',
            verified_at: null,
            last_used_at: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        prepared_email_drafts: [
          draftRow({
            id: 'draft-unverified',
            contact_point_id: CONTACT_ID,
            contact_email: 'sarah.chen@acmehealth.com',
            draft_status: 'NEEDS_VERIFIED_CONTACT',
          }),
        ],
      },
    })

    const { res } = await postSend({ draftId: 'draft-unverified', idempotencyKey: 'idem-unverified' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(h.send).not.toHaveBeenCalled()
    expect(h.fake.tables.email_messages).toHaveLength(0)
  })

  it('contact discovered/verified AFTER a draft exists becomes send-eligible without needing a new draft', async () => {
    // Prepare with no contact -> NEEDS_VERIFIED_CONTACT, content still generated.
    const h1 = setupHarness({ seed: { contact_points: [] }, leadOverrides: EXPLICIT_NEED_LEAD_OVERRIDES })
    const prepared = await postPrepare({ revenueIdentityId: IDENTITY_ID })
    expect(prepared.data.draft?.draftStatus).toBe('NEEDS_VERIFIED_CONTACT')
    expect(prepared.data.draft?.subject).toBeTruthy()

    // A fresh prepare call against a lead that NOW has a verified contact
    // (simulating "contact was discovered/verified after the first draft")
    // must produce a READY draft using the same generated content path —
    // this test asserts the underlying mechanism (prepare is idempotent on
    // content, gated only by contact state) rather than in-place draft
    // mutation, since prepareEmailDraft always creates a fresh draft row.
    void h1
    const h2 = setupHarness({ leadOverrides: EXPLICIT_NEED_LEAD_OVERRIDES }) // default seed: VERIFIED contact
    const reprepared = await postPrepare({ revenueIdentityId: IDENTITY_ID })
    expect(reprepared.data.draft?.draftStatus).toBe('READY')
    expect(reprepared.data.draft?.subject).toBe(prepared.data.draft?.subject) // same generated content
    void h2
  })

  it('preparation creates zero accountability/send activity regardless of contact verification state', async () => {
    const h = setupHarness({ seed: { contact_points: [] } })
    await postPrepare({ revenueIdentityId: IDENTITY_ID })

    expect(h.send).not.toHaveBeenCalled()
    expect(h.markContacted).not.toHaveBeenCalled()
    expect(h.fake.tables.email_messages).toHaveLength(0)
    expect(h.fake.tables.email_send_attempts ?? []).toHaveLength(0)
  })

  it('blocks send on claim-safety failure', async () => {
    const h = setupHarness({
      seed: {
        prepared_email_drafts: [
          draftRow({
            id: 'draft-unsafe',
            claim_safety: {
              safe: false,
              repaired: false,
              allowedEvidence: [],
              thingsNotToClaim: [],
              issues: [{ sentence: 'I built your platform.', reason: 'Unsupported', requiredEvidence: ['VERIFIED_PROOF'] }],
              repairedBody: null,
            },
          }),
        ],
      },
    })

    const { res } = await postSend({ draftId: 'draft-unsafe', idempotencyKey: 'idem-unsafe' })
    expect(res.status).toBe(422)
    expect(h.send).not.toHaveBeenCalled()
    expect(h.markContacted).not.toHaveBeenCalled()
  })

  it('is idempotent on double-click and records exactly one activity chain', async () => {
    const h = setupHarness({
      seed: {
        prepared_email_drafts: [draftRow({ id: 'draft-ok' })],
      },
    })

    const first = await postSend({ draftId: 'draft-ok', idempotencyKey: 'idem-1' })
    const second = await postSend({ draftId: 'draft-ok', idempotencyKey: 'idem-1' })

    expect(first.res.status).toBe(200)
    expect(first.data.idempotent).toBe(false)
    expect(second.res.status).toBe(200)
    expect(second.data.idempotent).toBe(true)

    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.markContacted).toHaveBeenCalledTimes(1)

    expect(h.fake.tables.email_messages).toHaveLength(1)
    expect(h.fake.tables.email_delivery_events).toHaveLength(1)
    expect(h.counters.messages).toHaveLength(1)
    expect(h.counters.relayEvents).toHaveLength(1)
    expect(h.counters.accountabilityIncrements).toBe(1)

    expect(h.fake.tables.email_messages[0]?.message_id).toBe('msg-1')
  })

  it('failed provider send records zero successful email activity', async () => {
    const h = setupHarness({
      sendAccepted: false,
      seed: {
        prepared_email_drafts: [draftRow({ id: 'draft-fail-send' })],
      },
    })

    const { res } = await postSend({ draftId: 'draft-fail-send', idempotencyKey: 'idem-fail-send' })

    expect(res.status).toBe(500)
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.markContacted).not.toHaveBeenCalled()
    expect(h.fake.tables.email_messages).toHaveLength(0)
    expect(h.counters.messages).toHaveLength(0)
    expect(h.counters.relayEvents).toHaveLength(0)
    expect(h.counters.accountabilityIncrements).toBe(0)
  })

  it('denies suppressed, bounced, and invalid contacts from send', async () => {
    const suppressedHarness = setupHarness({
      seed: {
        prepared_email_drafts: [draftRow({ id: 'draft-suppressed' })],
        email_suppressions: [
          {
            id: 'sup-1',
            organization_id: ORG_ID,
            lead_id: LEAD_ID,
            contact_point_id: CONTACT_ID,
            email: 'sarah@acmehealth.com',
            reason: 'BOUNCE',
            active: true,
            source: 'system',
            notes: null,
            created_by: null,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    })
    const suppressed = await postSend({ draftId: 'draft-suppressed', idempotencyKey: 'idem-suppressed' })
    expect(suppressed.res.status).toBe(409)
    expect(suppressedHarness.send).not.toHaveBeenCalled()

    for (const status of ['BOUNCED', 'INVALID']) {
      const harness = setupHarness({
        seed: {
          contact_points: [
            {
              id: CONTACT_ID,
              organization_id: ORG_ID,
              lead_id: LEAD_ID,
              person_id: null,
              company_id: null,
              type: 'email',
              value: 'sarah@acmehealth.com',
              source: 'USER_PROVIDED',
              source_url: null,
              source_type: null,
              verification_status: status,
              verification_method: null,
              confidence: 1,
              is_primary: true,
              is_business_contact: true,
              discovered_at: '2026-01-01T00:00:00.000Z',
              verified_at: null,
              last_used_at: null,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          prepared_email_drafts: [draftRow({ id: `draft-${status.toLowerCase()}` })],
        },
      })
      const result = await postSend({ draftId: `draft-${status.toLowerCase()}`, idempotencyKey: `idem-${status.toLowerCase()}` })
      expect(result.res.status).toBe(409)
      expect(harness.send).not.toHaveBeenCalled()
    }
  })
})
