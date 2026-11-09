/**
 * Runtime request paths under the real application role.
 *
 * These exercise the code a logged-in request actually runs, through the
 * `relay_app` client (BYPASSRLS=false) — not a mock and not the service role.
 */
import { describe, expect, it } from 'vitest'
import { neonDbClient } from '@/lib/db/neon'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { emitAction, getDailySummary, getPendingForRep } from '@/lib/action-ledger'
import { loadSenderProfiles } from '@/lib/relay/routing-context'

const ORG = '11111111-1111-1111-1111-111111111111'
const REP = 'ec4f844d-24ca-4fb5-ae4f-4138244abace'
const AUTH_USER = '02b2d1bc-346c-469c-86cd-a200e6b74a43'

describe('runtime request paths as relay_app', () => {
  it('loadOperatingPolicy reads the policy through the runtime client', async () => {
    const client = neonDbClient(AUTH_USER)
    const policy = await loadOperatingPolicy(ORG, client)
    expect(policy.organizationId).toBe(ORG)
    expect(policy.timezone).toBeTruthy()
  }, 30_000)

  it('getDailySummary reads org action events without permission errors', async () => {
    const client = neonDbClient(AUTH_USER)
    const date = new Date().toISOString().slice(0, 10)
    const summary = await getDailySummary(ORG, date, 'UTC', client)
    expect(Array.isArray(summary)).toBe(true)
  }, 30_000)

  it('getPendingForRep returns a count for the acting rep', async () => {
    const client = neonDbClient(AUTH_USER)
    const count = await getPendingForRep(ORG, REP, client)
    expect(typeof count).toBe('number')
    expect(count).toBeGreaterThanOrEqual(0)
  }, 30_000)

  it('loadSenderProfiles reads the acting rep profiles', async () => {
    const client = neonDbClient(AUTH_USER)
    const senders = await loadSenderProfiles(client, ORG, REP)
    expect(Array.isArray(senders)).toBe(true)
  }, 30_000)

  it('emitAction writes an action event through the runtime client', async () => {
    const client = neonDbClient(AUTH_USER)
    const id = await emitAction({
      orgId: ORG,
      actionType: 'LEAD_EXTRACTED',
      actorType: 'rep',
      actorId: REP,
      executionStatus: 'generated',
      idempotencyKey: `rt-test-${Date.now()}`,
      client,
    })
    expect(id).toBeTruthy()
  }, 30_000)
})
