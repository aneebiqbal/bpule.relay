import { describe, expect, it } from 'vitest'
import { NeonDbClient } from '@/lib/db/neon'
import { PostgresDbClient } from '@/lib/db/postgres'

/**
 * BUG-40 — the DB adapters bound RPC arguments positionally.
 *
 * `record_prospect_extracted` sent `{ p_rep_id, p_identity_id,
 * p_activity_type, p_org_id, p_date }`, which the adapter bound to `$1..$5`.
 * The function's `$5` is `p_source_event_id`, so the business date landed in
 * the idempotency slot: the first capture of a day inserted
 * `source_event_ids = ['2026-11-18']` and every later capture was answered
 * `already_recorded`. A whole day of genuine captures collapsed into one.
 *
 * Both adapters (Neon and standard Postgres — the production provider) had the
 * same defect; both must bind by name.
 */
describe.each([
  ['neon', (executor: never) => new NeonDbClient(executor, 'user-1')],
  ['postgres', (executor: never) => new PostgresDbClient(executor, 'user-1')],
])('%s adapter rpc named binding (BUG-40)', (_name, make) => {
  function clientCapturingSql() {
    const captured: Array<{ text: string; values: unknown[] }> = []
    const executor = {
      query: async (text: string, values: unknown[]) => {
        captured.push({ text, values })
        return []
      },
    }
    return { client: make(executor as never), captured }
  }

  it('binds arguments by parameter name, not by call-site order', async () => {
    const { client, captured } = clientCapturingSql()
    // The exact shape the buggy caller used: p_date where p_source_event_id is.
    await client.rpc('record_activity_event', {
      p_rep_id: 'rep-1',
      p_identity_id: 'identity-1',
      p_activity_type: 'prospect_extracted',
      p_org_id: 'org-1',
      p_date: '2026-11-18',
    })
    expect(captured).toHaveLength(1)
    expect(captured[0].text).toBe(
      'SELECT * FROM "record_activity_event"("p_rep_id" => $1, "p_identity_id" => $2, ' +
        '"p_activity_type" => $3, "p_org_id" => $4, "p_date" => $5)',
    )
    expect(captured[0].values).toEqual(['rep-1', 'identity-1', 'prospect_extracted', 'org-1', '2026-11-18'])
  })

  it('keeps the caller order for the bound values', async () => {
    const { client, captured } = clientCapturingSql()
    await client.rpc('some_fn', { b: 2, a: 1 })
    expect(captured[0].text).toBe('SELECT * FROM "some_fn"("b" => $1, "a" => $2)')
    expect(captured[0].values).toEqual([2, 1])
  })
})
