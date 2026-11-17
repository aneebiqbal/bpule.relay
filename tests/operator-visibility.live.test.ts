/**
 * Operator execution visibility — live against the real database.
 *
 * Regression cover for the P0 where an admin-assigned operator could not see
 * the channel they were given:
 *   1. the read scope derived its candidates from identity_assignments only,
 *      so a seated PRIMARY/OPERATOR with no eligibility row saw nothing;
 *   2. the admin revenue-identity assign route wrote eligibility only, never a
 *      profile_coverage seat.
 *
 * The service pool does not bind a `begin` transaction to later queries, so a
 * rollback is not reliable here. Each case creates a uniquely-labelled fixture
 * and deletes it (and every row that references it) in a `finally`.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { closeDbPool, serviceDbClient } from '@/lib/db/client'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import { addOperatorResponsibility, removeOperatorResponsibility, readResponsibilityChain } from '@/lib/profiles/assignment'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

const ORG = '11111111-1111-1111-1111-111111111111'
const AHMAD = 'aaaaaaaa-0000-0000-0000-000000000004'
const MADIHA = 'aaaaaaaa-0000-0000-0000-000000000003'
const DAWOOD = 'ec4f844d-24ca-4fb5-ae4f-4138244abace'
const ACTOR = 'aaaaaaaa-0000-0000-0000-000000000001'

const liveDb = Boolean(process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL)
const describeLive = liveDb ? describe : describe.skip

afterAll(async () => { await closeDbPool() })

type Client = ReturnType<typeof serviceDbClient>

async function businessDate(client: Client): Promise<string> {
  const policy = await loadOperatingPolicy(ORG, client)
  return orgDate(currentInstant(), policy.timezone)
}

async function seedFixture(client: Client) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const label = `ZZ Visibility ${stamp}`
  const { data: profile } = await client.from('profiles').insert({
    organization_id: ORG,
    rep_id: ACTOR,
    platform: 'upwork',
    full_name: label,
    display_name: label,
    label,
  }).select('id').single()
  const { data: identity } = await client.from('revenue_identities').insert({
    organization_id: ORG,
    profile_id: profile.id,
    identity_name: label,
    channel: 'upwork',
    status: 'active',
    slug: `zz-visibility-${stamp}`,
  }).select('id').single()
  return { profileId: profile.id as string, identityId: identity.id as string }
}

/** Delete the fixture and every row that references it. */
async function cleanupFixture(client: Client, profileId: string, identityId: string) {
  await client.from('accountability_audit_log').delete().eq('revenue_identity_id', identityId)
  await client.from('responsibility_acknowledgements').delete().eq('profile_id', profileId)
  await client.from('coverage_events').delete().eq('profile_id', profileId)
  await client.from('identity_assignments').delete().eq('revenue_identity_id', identityId)
  await client.from('daily_accountability').delete().eq('revenue_identity_id', identityId)
  await client.from('daily_target_plans').delete().eq('revenue_identity_id', identityId)
  await client.from('profile_coverage').delete().eq('profile_id', profileId)
  await client.from('portfolio_projects').delete().eq('profile_id', profileId)
  await client.from('proof_cards').delete().eq('profile_id', profileId)
  await client.from('profile_experience').delete().eq('profile_id', profileId)
  await client.from('profile_reviews').delete().eq('profile_id', profileId)
  await client.from('notifications').delete().like('link', `/team/profiles/${profileId}%`)
  await client.from('revenue_identities').delete().eq('id', identityId)
  await client.from('profiles').delete().eq('id', profileId)
}

describeLive('OPERATOR_VISIBILITY', () => {
  it('a seated operator sees the channel even without an eligibility row', async () => {
    const client = serviceDbClient()
    const date = await businessDate(client)
    const { profileId, identityId } = await seedFixture(client)
    try {
      // Seat only: no identity_assignments row (the state a non-canonical
      // writer used to leave behind).
      await client.from('profile_coverage').insert({
        organization_id: ORG,
        profile_id: profileId,
        rep_id: MADIHA,
        role: 'OPERATOR',
        priority: 1,
        active: true,
        created_by: ACTOR,
      })
      const seen = await listExecutableIdentitiesForRep(client, ORG, MADIHA, date)
      expect(seen.some((row) => row.id === identityId)).toBe(true)
    } finally {
      await cleanupFixture(client, profileId, identityId)
    }
  }, 180_000)

  it('adding an operator preserves every existing seat', async () => {
    const client = serviceDbClient()
    const date = await businessDate(client)
    const { profileId, identityId } = await seedFixture(client)
    try {
      await addOperatorResponsibility(client, { orgId: ORG, identityId, repId: MADIHA, actorRepId: ACTOR })
      await addOperatorResponsibility(client, { orgId: ORG, identityId, repId: DAWOOD, actorRepId: ACTOR })

      const chain = await readResponsibilityChain(client, ORG, profileId)
      expect(chain.operators.map((seat) => seat.repId).sort()).toEqual([DAWOOD, MADIHA].sort())

      for (const repId of [MADIHA, DAWOOD]) {
        const seen = await listExecutableIdentitiesForRep(client, ORG, repId, date)
        expect(seen.some((row) => row.id === identityId), repId).toBe(true)
      }
    } finally {
      await cleanupFixture(client, profileId, identityId)
    }
  }, 180_000)

  it('removing one operator does not affect the other', async () => {
    const client = serviceDbClient()
    const date = await businessDate(client)
    const { profileId, identityId } = await seedFixture(client)
    try {
      await addOperatorResponsibility(client, { orgId: ORG, identityId, repId: MADIHA, actorRepId: ACTOR })
      await addOperatorResponsibility(client, { orgId: ORG, identityId, repId: DAWOOD, actorRepId: ACTOR })
      await removeOperatorResponsibility(client, { orgId: ORG, identityId, repId: MADIHA, actorRepId: ACTOR })

      const removed = await listExecutableIdentitiesForRep(client, ORG, MADIHA, date)
      expect(removed.some((row) => row.id === identityId)).toBe(false)
      const kept = await listExecutableIdentitiesForRep(client, ORG, DAWOOD, date)
      expect(kept.some((row) => row.id === identityId)).toBe(true)
    } finally {
      await cleanupFixture(client, profileId, identityId)
    }
  }, 180_000)
})
