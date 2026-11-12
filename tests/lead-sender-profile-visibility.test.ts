/**
 * A lead must show its sender profile to every viewer in the organisation.
 *
 * Regression this guards: the lead page resolved the sender profile with
 * `store.getProfile(id)`, which is REP-scoped and returns null for a profile
 * owned by a colleague — so an admin (or any operator) opening a team lead saw
 * "Profile not assigned" on a lead that plainly had one. The org-scoped
 * `listProfilesByIds` is the correct authority.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { closeDbPool, serviceDbClient } from '@/lib/db/client'

const ROOT = process.cwd()
const ORG = '11111111-1111-1111-1111-111111111111'

afterAll(async () => { await closeDbPool() })

describe('LEAD_PAGE_RESOLVES_SENDER_PROFILE_ORG_SCOPED', () => {
  it('uses listProfilesByIds for the sender profile, never rep-scoped getProfile', () => {
    const src = readFileSync(join(ROOT, 'src/app/(app)/leads/[id]/page.tsx'), 'utf8')
    expect(src, 'sender profile must resolve through the org-scoped loader').toMatch(
      /listProfilesByIds\(\[lead\.senderProfileId\]\)/,
    )
    expect(src, 'getProfile is rep-scoped and returns null for a colleague\'s profile').not.toMatch(
      /getProfile\(lead\.senderProfileId\)/,
    )
  })

  it('the two store methods really do differ in scope', () => {
    const src = readFileSync(join(ROOT, 'src/lib/store/supabase-store.ts'), 'utf8')

    const getProfile = src.match(/async getProfile\(id: string\)[\s\S]*?\n  \}/)
    expect(getProfile?.[0], 'getProfile must stay rep-scoped (it guards writes)').toMatch(
      /rep_id\s*!==\s*this\.rep\.id/,
    )

    const listByIds = src.match(/async listProfilesByIds\(ids: string\[\]\)[\s\S]*?\n  \}/)
    expect(listByIds?.[0], 'listProfilesByIds must be org-scoped').toMatch(/organization_id/)
    expect(listByIds?.[0], 'listProfilesByIds must not filter by rep').not.toMatch(/rep_id/)
  })

  it('the scenario is real: leads exist whose sender profile belongs to another rep', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ n: number }>(
      `select count(*)::int as n
         from leads l
         join profiles p on p.id = l.sender_profile_id
        where l.organization_id = $1
          and p.rep_id <> l.owner_rep_id`,
      [ORG],
    )
    expect(error).toBeNull()
    // If this ever reaches 0 the guard above stops being meaningful, so pin it.
    expect(data?.[0]?.n ?? 0).toBeGreaterThan(0)
  }, 60_000)
})
