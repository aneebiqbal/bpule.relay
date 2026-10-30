/**
 * The scheduler must materialise a day row for every rep when the day opens.
 *
 * Regression: `refreshRepDays` only updates rows that already exist, and a
 * rep_day row was otherwise created only on check-in. A rep who never checked in
 * was therefore invisible to the scheduler all day — no NOT_STARTED, no warning,
 * no missed close — and the first live production run planned 57 jobs and
 * executed them while `rep_day` stayed empty.
 */
import { describe, expect, it } from 'vitest'
import { ensureRepDays } from '@/lib/scheduler/run'

interface Upsert {
  table: string
  rows: Array<Record<string, unknown>>
  options: Record<string, unknown>
}

function fakeClient(reps: Array<{ id: string }> | null, error: unknown = null) {
  const upserts: Upsert[] = []
  const client = {
    from(table: string) {
      if (table === 'reps') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: reps, error }),
          }),
        }
      }
      if (table === 'rep_day') {
        return {
          upsert: (rows: Array<Record<string, unknown>>, options: Record<string, unknown>) => {
            upserts.push({ table, rows, options })
            return Promise.resolve({ error: null })
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { client, upserts }
}

const ORG = '11111111-1111-1111-1111-111111111111'
const DATE = '2026-10-30'

describe('ensureRepDays', () => {
  it('creates one NOT_STARTED row per rep in the organization', async () => {
    const { client, upserts } = fakeClient([{ id: 'rep-1' }, { id: 'rep-2' }])

    const result = await ensureRepDays(client as never, ORG, DATE)

    expect(result.reps).toBe(2)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].rows).toEqual([
      { organization_id: ORG, rep_id: 'rep-1', business_date: DATE, state: 'NOT_STARTED' },
      { organization_id: ORG, rep_id: 'rep-2', business_date: DATE, state: 'NOT_STARTED' },
    ])
  })

  it('is idempotent: conflicts are ignored, so a check-in is never reset', async () => {
    const { client, upserts } = fakeClient([{ id: 'rep-1' }])

    await ensureRepDays(client as never, ORG, DATE)

    expect(upserts[0].options).toMatchObject({
      onConflict: 'organization_id,rep_id,business_date',
      ignoreDuplicates: true,
    })
  })

  it('does nothing when the organization has no reps', async () => {
    const { client, upserts } = fakeClient([])
    const result = await ensureRepDays(client as never, ORG, DATE)

    expect(result.reps).toBe(0)
    expect(upserts).toHaveLength(0)
  })

  it('does nothing when the reps table is missing', async () => {
    const { client, upserts } = fakeClient(null, { message: 'relation "reps" does not exist', code: '42P01' })
    const result = await ensureRepDays(client as never, ORG, DATE)

    expect(result.reps).toBe(0)
    expect(upserts).toHaveLength(0)
  })
})
