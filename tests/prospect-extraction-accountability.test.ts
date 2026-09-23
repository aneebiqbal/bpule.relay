import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

/**
 * Extraction accountability credit (approved product design, part B).
 *
 * Previously, capturing/scoring a new prospect earned ZERO accountability
 * credit anywhere. The fix: a new activity_type 'prospect_extracted', and
 * SupabaseStore.recordProspectExtracted() (mirroring markContacted's and
 * markUpworkApplied's lookup-then-increment pattern) to award it.
 *
 * Critically, this must fire only on a GENUINE new capture, never on a
 * reuse/cache hit — captureProspect() dedupes by
 * (organization_id, owner_rep_id, raw_input, status='captured') and returns
 * the existing row without inserting when one already exists. The
 * isNewCapture flag on its return value is exactly this signal, and callers
 * (the /api/prospect/analyze route) must gate recordProspectExtracted() on
 * it so re-analyzing the same paste never double-credits.
 */

const ORG_ID = 'org-test'
const REP_ID = 'rep-1'
const IDENTITY_ID = 'ri-linkedin-1'

function makeRep(): Rep {
  return { id: REP_ID, name: 'Test Rep', role: 'rep', organizationId: ORG_ID, createdAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC' }
}

function makeOrg(): Organization {
  return { id: ORG_ID, name: 'Test Org', plan: 'active', billingCustomerId: null, timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], holidays: [], createdAt: '2026-01-01T00:00:00.000Z' }
}

function captureInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rawInput: 'Sarah Chen, CTO at Acme. Hiring senior engineers.',
    extractedName: 'Sarah Chen',
    extractedCompany: 'Acme',
    extractedTitle: 'CTO',
    extractedLocation: null,
    linkedinUrl: null,
    companyUrl: null,
    canonicalScore: 80,
    canonicalIntelligence: null,
    scoreBreakdown: null,
    revenueIdentityId: IDENTITY_ID,
    senderProfileId: null,
    ...overrides,
  }
}

describe('captureProspect — isNewCapture signal', () => {
  it('marks a brand-new raw_input as a genuine new capture', async () => {
    const fake = createFakeSupabase({ captured_prospects: [] })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    const result = await store.captureProspect(captureInput())
    expect(result.isNewCapture).toBe(true)
  })

  it('marks a re-analyze of the SAME raw_input (same rep, same org) as a reuse hit, not a new capture', async () => {
    const fake = createFakeSupabase({ captured_prospects: [] })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    const first = await store.captureProspect(captureInput())
    expect(first.isNewCapture).toBe(true)

    const second = await store.captureProspect(captureInput())
    expect(second.isNewCapture).toBe(false)
    expect(second.id).toBe(first.id) // same row, not a new insert
  })

  it('a different raw_input from the same rep is still a genuine new capture', async () => {
    const fake = createFakeSupabase({ captured_prospects: [] })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    await store.captureProspect(captureInput())
    const second = await store.captureProspect(captureInput({ rawInput: 'A totally different paste about a different company.' }))
    expect(second.isNewCapture).toBe(true)
  })
})

describe('recordProspectExtracted — accountability increment', () => {
  it('calls record_activity_event for "prospect_extracted" for every active target', async () => {
    const fake = createFakeSupabase({
      daily_targets: [
        { id: 'dt-1', organization_id: ORG_ID, rep_id: REP_ID, revenue_identity_id: IDENTITY_ID, activity_type: 'prospect_extracted', target_count: 15, active: true },
      ],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    await store.recordProspectExtracted(IDENTITY_ID)

    const activityCalls = fake.rpcCalls.filter((c) => c.fn === 'record_activity_event')
    expect(activityCalls).toHaveLength(1)
    expect(activityCalls[0]?.args).toMatchObject({
      p_rep_id: REP_ID,
      p_identity_id: IDENTITY_ID,
      p_activity_type: 'prospect_extracted',
      p_org_id: ORG_ID,
    })
  })

  it('does nothing (no RPC calls) when the rep has no active prospect_extracted target', async () => {
    const fake = createFakeSupabase({ daily_targets: [] })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    await store.recordProspectExtracted(IDENTITY_ID)

    expect(fake.rpcCalls.filter((c) => c.fn === 'record_activity_event')).toHaveLength(0)
  })

  it('never throws even if the underlying lookup fails — non-fatal by design', async () => {
    const fake = createFakeSupabase({ daily_targets: [] })
    // Simulate a broken client whose .from() throws synchronously.
    const brokenClient = {
      from() {
        throw new Error('boom')
      },
      rpc: fake.client.rpc,
    }
    const store = new SupabaseStore(makeRep(), brokenClient as never, makeOrg())
    await expect(store.recordProspectExtracted(IDENTITY_ID)).resolves.toBeUndefined()
  })
})

describe('extraction credit fires once per genuine new capture, not on reuse (integration of both halves)', () => {
  it('a caller that gates recordProspectExtracted on isNewCapture credits exactly once across a capture + re-analyze', async () => {
    const fake = createFakeSupabase({
      captured_prospects: [],
      daily_targets: [
        { id: 'dt-1', organization_id: ORG_ID, rep_id: REP_ID, revenue_identity_id: IDENTITY_ID, activity_type: 'prospect_extracted', target_count: 15, active: true },
      ],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    // This is exactly the pattern the analyze route must use once wired up:
    // only call recordProspectExtracted when isNewCapture is true.
    async function analyzeOnce() {
      const captured = await store.captureProspect(captureInput())
      if (captured.isNewCapture) {
        await store.recordProspectExtracted(captured.revenueIdentityId)
      }
      return captured
    }

    await analyzeOnce() // genuine new capture -> should credit
    await analyzeOnce() // reuse hit (same rawInput) -> must NOT credit again
    await analyzeOnce() // reuse hit again -> must NOT credit again

    const activityCalls = fake.rpcCalls.filter((c) => c.fn === 'record_activity_event' && c.args?.p_activity_type === 'prospect_extracted')
    expect(activityCalls).toHaveLength(1)
  })
})
