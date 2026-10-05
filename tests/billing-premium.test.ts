import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isPremium,
  FREE_LIMITS,
  dailySendLimit,
  dailyConnectionLimit,
  messageTypeLimitForPlan,
  studioGenerationLimit,
  prospectCheckLimit,
  planFromStripeSubscriptionStatus,
  UNLIMITED,
} from '@/lib/billing/premium'
import type { OrganizationPlan } from '@/lib/domain/types'

// ── Top-level mocks (vitest requires vi.mock at module scope) ─────────────

const mockGetCurrentUser = vi.hoisted(() => vi.fn())
const mockIsDemoMode = vi.hoisted(() => vi.fn().mockReturnValue(false))
const mockIsPremium = vi.hoisted(() => vi.fn((plan: string) => plan === 'active'))
const mockGetStripe = vi.hoisted(() => vi.fn())
const mockGetWebhookSecret = vi.hoisted(() => vi.fn().mockReturnValue('whsec_test'))
const mockPlanFromStripe = vi.hoisted(() => vi.fn())
const mockCreateServiceSupabase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/current', () => ({
  getCurrentUser: mockGetCurrentUser,
}))
vi.mock('@/lib/ai/config', () => ({
  isDemoMode: mockIsDemoMode,
}))
vi.mock('@/lib/billing/premium', async (importOriginal) => {
  // Re-export the real module so unit tests work; the route-specific
  // tests below override isPremium via the mock.
  const actual = await importOriginal<typeof import('@/lib/billing/premium')>()
  return {
    ...actual,
    isPremium: mockIsPremium,
  }
})
vi.mock('@/lib/billing/stripe', () => ({
  getStripe: mockGetStripe,
  getWebhookSecret: mockGetWebhookSecret,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}))

function makeMockSupabase() {
  const chain: any = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    // update returns the chain so .from().update().eq() works (Supabase query builder)
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'no exec_sql' } }),
    from: vi.fn().mockReturnThis(),
  }
  chain.from = vi.fn().mockReturnValue(chain)
  return chain
}

// ── 1. isPremium ──────────────────────────────────────────────────────────

describe('isPremium', () => {
  it('returns true only for active', () => {
    expect(isPremium('active')).toBe(true)
    expect(isPremium('trial')).toBe(false)
    expect(isPremium('past_due')).toBe(false)
    expect(isPremium('canceled')).toBe(false)
  })

  it('handles null/undefined/non-plan values', () => {
    expect(isPremium(null)).toBe(false)
    expect(isPremium(undefined)).toBe(false)
    expect(isPremium('')).toBe(false)
    expect(isPremium('random')).toBe(false)
  })
})

// ── 2. planFromStripeSubscriptionStatus ───────────────────────────────────

describe('planFromStripeSubscriptionStatus', () => {
  it('maps active and trialing to active (premium)', () => {
    expect(planFromStripeSubscriptionStatus('active')).toBe('active')
    expect(planFromStripeSubscriptionStatus('trialing')).toBe('active')
  })

  it('maps past_due, unpaid, paused to past_due (not premium)', () => {
    expect(planFromStripeSubscriptionStatus('past_due')).toBe('past_due')
    expect(planFromStripeSubscriptionStatus('unpaid')).toBe('past_due')
    expect(planFromStripeSubscriptionStatus('paused')).toBe('past_due')
  })

  it('maps canceled and incomplete_expired to canceled', () => {
    expect(planFromStripeSubscriptionStatus('canceled')).toBe('canceled')
    expect(planFromStripeSubscriptionStatus('incomplete_expired')).toBe('canceled')
  })

  it('maps incomplete and unknown to trial (not premium)', () => {
    expect(planFromStripeSubscriptionStatus('incomplete')).toBe('trial')
    expect(planFromStripeSubscriptionStatus('unknown_status')).toBe('trial')
    expect(planFromStripeSubscriptionStatus(null)).toBe('trial')
    expect(planFromStripeSubscriptionStatus(undefined)).toBe('trial')
  })

  it('every Stripe status maps to a non-premium plan except active/trialing', () => {
    const stripeStatuses = [
      'incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'trialing',
      'incomplete_expired', 'paused',
    ]
    for (const status of stripeStatuses) {
      const plan = planFromStripeSubscriptionStatus(status)
      expect(['trial', 'active', 'past_due', 'canceled']).toContain(plan)
      if (status !== 'active' && status !== 'trialing') {
        expect(isPremium(plan)).toBe(false)
      }
    }
  })
})

// ── 3. Limit functions ────────────────────────────────────────────────────

describe('dailySendLimit', () => {
  it('returns UNLIMITED for premium', () => {
    expect(dailySendLimit('active')).toBe(UNLIMITED)
  })

  it('returns free limit for non-premium', () => {
    expect(dailySendLimit('trial')).toBe(FREE_LIMITS.dailySends)
    expect(dailySendLimit('past_due')).toBe(FREE_LIMITS.dailySends)
    expect(dailySendLimit('canceled')).toBe(FREE_LIMITS.dailySends)
  })
})

describe('dailyConnectionLimit', () => {
  it('returns UNLIMITED for premium', () => {
    expect(dailyConnectionLimit('active')).toBe(UNLIMITED)
  })

  it('returns free limit for non-premium', () => {
    expect(dailyConnectionLimit('trial')).toBe(FREE_LIMITS.dailyConnections)
  })
})

describe('messageTypeLimitForPlan', () => {
  it('uses connection limit for connection/upwork types', () => {
    expect(messageTypeLimitForPlan('trial', 'connection')).toBe(FREE_LIMITS.dailyConnections)
    expect(messageTypeLimitForPlan('trial', 'upwork')).toBe(FREE_LIMITS.dailyConnections)
    expect(messageTypeLimitForPlan('active', 'connection')).toBe(UNLIMITED)
    expect(messageTypeLimitForPlan('active', 'upwork')).toBe(UNLIMITED)
  })

  it('uses send limit for dm/followup/reply types', () => {
    expect(messageTypeLimitForPlan('trial', 'dm')).toBe(FREE_LIMITS.dailySends)
    expect(messageTypeLimitForPlan('trial', 'followup')).toBe(FREE_LIMITS.dailySends)
    expect(messageTypeLimitForPlan('trial', 'reply')).toBe(FREE_LIMITS.dailySends)
    expect(messageTypeLimitForPlan('active', 'dm')).toBe(UNLIMITED)
  })
})

describe('studioGenerationLimit', () => {
  it('returns UNLIMITED for premium', () => {
    expect(studioGenerationLimit('active')).toBe(UNLIMITED)
  })

  it('returns free limit (2) for non-premium — preserves existing code behavior', () => {
    expect(studioGenerationLimit('trial')).toBe(2)
    expect(studioGenerationLimit('past_due')).toBe(2)
    expect(studioGenerationLimit('canceled')).toBe(2)
  })
})

describe('prospectCheckLimit', () => {
  it('returns null (unlimited) for premium', () => {
    expect(prospectCheckLimit('active')).toBeNull()
  })

  it('returns 10 for non-premium', () => {
    expect(prospectCheckLimit('trial')).toBe(10)
    expect(prospectCheckLimit('past_due')).toBe(10)
    expect(prospectCheckLimit('canceled')).toBe(10)
  })
})

// ── 4. FREE_LIMITS constant ────────────────────────────────────────────────

describe('FREE_LIMITS', () => {
  it('preserves existing application limits', () => {
    expect(FREE_LIMITS.dailySends).toBe(15)
    expect(FREE_LIMITS.dailyConnections).toBe(20)
    expect(FREE_LIMITS.prospectChecks).toBe(10)
  })

  it('studio limit matches the enforced code behavior (2, not 3)', () => {
    expect(FREE_LIMITS.studioGenerations).toBe(2)
  })
})

// ── 5. Checkout route guards ──────────────────────────────────────────────

describe('checkout route guards', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetCurrentUser.mockReset()
    mockIsDemoMode.mockReset().mockReturnValue(false)
    mockIsPremium.mockReset().mockImplementation((plan: string) => plan === 'active')
  })

  it('rejects unauthenticated requests with 401', async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const { POST } = await import('@/app/api/billing/checkout/route')
    const req = new Request('http://localhost/api/billing/checkout', { method: 'POST' })
    const res = await POST(req as any)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toContain('Not authenticated')
  })

  it('rejects already-premium orgs with 409', async () => {
    mockGetCurrentUser.mockResolvedValue({
      rep: { id: 'rep1', role: 'admin' },
      organization: { id: 'org1', plan: 'active', name: 'Test Org', billingCustomerId: null },
    })

    const { POST } = await import('@/app/api/billing/checkout/route')
    const req = new Request('http://localhost/api/billing/checkout', { method: 'POST' })
    const res = await POST(req as any)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('already has')
  })

  it('blocks demo mode with 400', async () => {
    mockGetCurrentUser.mockResolvedValue({
      rep: { id: 'rep1', role: 'admin' },
      organization: { id: 'org1', plan: 'active', name: 'Test Org', billingCustomerId: null },
    })
    mockIsDemoMode.mockReturnValue(true)

    const { POST } = await import('@/app/api/billing/checkout/route')
    const req = new Request('http://localhost/api/billing/checkout', { method: 'POST' })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('demo')
  })
})

// ── 6. Webhook signature verification ─────────────────────────────────────

describe('webhook signature verification', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetStripe.mockReset()
    mockGetWebhookSecret.mockReset().mockReturnValue('whsec_test')
    mockPlanFromStripe.mockReset()
    mockCreateServiceSupabase.mockReset()
  })

  it('rejects requests without stripe-signature header', async () => {
    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: vi.fn() },
    })
    mockCreateServiceSupabase.mockReturnValue(makeMockSupabase())

    const { POST } = await import('@/app/api/billing/webhook/route')
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: 'raw-body',
      headers: {},
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it('rejects requests with invalid signature', async () => {
    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: vi.fn().mockImplementation(() => { throw new Error('Invalid signature') }) },
    })
    mockCreateServiceSupabase.mockReturnValue(makeMockSupabase())

    const { POST } = await import('@/app/api/billing/webhook/route')
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: 'raw-body',
      headers: { 'stripe-signature': 'invalid' },
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid signature')
  })
})

// ── 7. Webhook checkout.session.completed — no optimistic grant ───────────

describe('checkout.session.completed does not grant premium optimistically', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetStripe.mockReset()
    mockGetWebhookSecret.mockReset().mockReturnValue('whsec_test')
    mockCreateServiceSupabase.mockReset()
  })

  it('does NOT set plan=active when subscription id is missing', async () => {
    // Stripe event: checkout.session.completed with no subscription field
    const event = {
      id: 'evt_no_sub',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          customer: 'cus_test',
          metadata: { orgId: 'org1', repId: 'rep1' },
          client_reference_id: 'org1',
          // session.subscription is absent — the rare edge case
        },
      },
    }

    const updateCalls: Array<{ plan: string }> = []
    const mockSupabase = makeMockSupabase()
    // Track what plan value is passed to the organizations.update
    mockSupabase.update = vi.fn().mockImplementation((obj: any) => {
      if (obj && obj.plan) updateCalls.push(obj)
      return mockSupabase // return chain so .eq() works
    })

    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: vi.fn().mockReturnValue(event) },
      subscriptions: { retrieve: vi.fn() },
    })
    mockCreateServiceSupabase.mockReturnValue(mockSupabase)

    const { POST } = await import('@/app/api/billing/webhook/route')
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'stripe-signature': 'valid' },
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)

    // Critical: plan must NOT have been set to 'active'
    const activeGrants = updateCalls.filter((c) => c.plan === 'active')
    expect(activeGrants).toHaveLength(0)
  })

  it('sets plan from retrieved subscription status when subId is present', async () => {
    const event = {
      id: 'evt_with_sub',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_456',
          customer: 'cus_test',
          subscription: 'sub_test_789',
          metadata: { orgId: 'org1', repId: 'rep1' },
          client_reference_id: 'org1',
        },
      },
    }

    const updateCalls: Array<{ plan: string }> = []
    const mockSupabase = makeMockSupabase()
    mockSupabase.update = vi.fn().mockImplementation((obj: any) => {
      if (obj && obj.plan) updateCalls.push(obj)
      return mockSupabase // return chain so .eq() works
    })

    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: vi.fn().mockReturnValue(event) },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_test_789',
          status: 'active',
          customer: 'cus_test',
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          items: { data: [{ price: { id: 'price_test' } }] },
        }),
      },
    })
    mockCreateServiceSupabase.mockReturnValue(mockSupabase)

    const { POST } = await import('@/app/api/billing/webhook/route')
    const req = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'stripe-signature': 'valid' },
    })
    const res = await POST(req as any)
    expect(res.status).toBe(200)

    // Plan should be 'active' because the retrieved subscription is active
    expect(updateCalls.some((c) => c.plan === 'active')).toBe(true)
  })
})

// ── 7b. Webhook idempotency ──────────────────────────────────────────────

describe('webhook idempotency', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetStripe.mockReset()
    mockGetWebhookSecret.mockReset().mockReturnValue('whsec_test')
    mockCreateServiceSupabase.mockReset()
  })

  it('duplicate event delivery is acknowledged but not re-processed', async () => {
    const event = {
      id: 'evt_dup',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_dup',
          status: 'active',
          customer: 'cus_test',
          metadata: { orgId: 'org1' },
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          items: { data: [{ price: { id: 'price_test' } }] },
        },
      },
    }

    let updateCallCount = 0
    const mockSupabase = makeMockSupabase()
    mockSupabase.update = vi.fn().mockImplementation(() => {
      updateCallCount++
      return mockSupabase // return chain so .eq() works
    })

    // First call: event not processed yet. Second call: already processed.
    let callCount = 0
    mockSupabase.maybeSingle = vi.fn().mockImplementation(() => {
      callCount++
      // Return null first time (not processed), then return data (processed)
      return Promise.resolve({ data: callCount > 1 ? { stripe_event_id: 'evt_dup' } : null })
    })

    mockGetStripe.mockReturnValue({
      webhooks: { constructEvent: vi.fn().mockReturnValue(event) },
    })
    mockCreateServiceSupabase.mockReturnValue(mockSupabase)

    const { POST } = await import('@/app/api/billing/webhook/route')

    // First delivery — should process
    const req1 = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'stripe-signature': 'valid' },
    })
    const res1 = await POST(req1 as any)
    expect(res1.status).toBe(200)

    // Second delivery — should be skipped as duplicate
    const req2 = new Request('http://localhost/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'stripe-signature': 'valid' },
    })
    const res2 = await POST(req2 as any)
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.duplicate).toBe(true)

    // updateOrgPlan should have been called only once (first delivery)
    expect(updateCallCount).toBe(1)
  })
})

// ── 8. Webhook lifecycle mapping (unit) ──────────────────────────────────

describe('webhook lifecycle mapping', () => {
  const cases: Array<{ status: string; expectedPremium: boolean }> = [
    { status: 'active', expectedPremium: true },
    { status: 'trialing', expectedPremium: true },
    { status: 'past_due', expectedPremium: false },
    { status: 'unpaid', expectedPremium: false },
    { status: 'canceled', expectedPremium: false },
    { status: 'incomplete', expectedPremium: false },
    { status: 'incomplete_expired', expectedPremium: false },
    { status: 'paused', expectedPremium: false },
  ]

  for (const { status, expectedPremium } of cases) {
    it(`subscription status "${status}" → premium=${expectedPremium}`, () => {
      const plan = planFromStripeSubscriptionStatus(status)
      expect(isPremium(plan)).toBe(expectedPremium)
    })
  }
})

// ── 8. Content route studio cap ───────────────────────────────────────────

describe('studio generation cap behavior', () => {
  it('free org is blocked at 2 generations (existing behavior preserved)', () => {
    const limit = studioGenerationLimit('trial')
    expect(limit).toBe(2)
    expect(2 >= limit).toBe(true)
    expect(1 >= limit).toBe(false)
  })

  it('premium org is never blocked (UNLIMITED = Infinity)', () => {
    const limit = studioGenerationLimit('active')
    expect(limit).toBe(UNLIMITED)
    expect(UNLIMITED).toBe(Infinity)
    expect(100 >= limit).toBe(false)
    expect(999999 >= limit).toBe(false)
  })
})

// ── 9. Prospect check cap ─────────────────────────────────────────────────

describe('prospect check cap behavior', () => {
  it('free org is capped at 10 (lifetime)', () => {
    const cap = prospectCheckLimit('trial')
    expect(cap).toBe(10)
  })

  it('premium org has no cap (null)', () => {
    const cap = prospectCheckLimit('active')
    expect(cap).toBeNull()
  })

  it('past_due org is still capped (not premium)', () => {
    const cap = prospectCheckLimit('past_due')
    expect(cap).toBe(10)
  })
})
