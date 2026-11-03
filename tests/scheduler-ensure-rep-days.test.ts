/**
 * The scheduler must materialise a day row for every rep when the day opens.
 *
 * Regression: `refreshRepDays` only updates rows that already exist, and a
 * rep_day row was otherwise created only on check-in. A rep who never checked in
 * was therefore invisible to the scheduler all day — no NOT_STARTED, no warning,
 * no missed close — and the first live production run planned 57 jobs, executed
 * them, and left `rep_day` empty.
 *
 * A row created mid-day must also reflect work already done, or a rep who has
 * been active all morning shows NOT_STARTED until their next check-in.
 */
import { describe, expect, it } from 'vitest'
import { normalizePolicy } from '@/lib/org-clock'
import { ensureRepDays } from '@/lib/scheduler/run'

const ORG = '11111111-1111-1111-1111-111111111111'
const DATE = '2026-10-30'
const POLICY = normalizePolicy({ organizationId: ORG, timezone: 'Asia/Karachi' })

interface Upsert {
  rows: Array<Record<string, unknown>>
  options: Record<string, unknown>
}

function fakeClient(input: {
  reps?: Array<{ id: string }> | null
  repsError?: unknown
  activity?: Array<{ actor_id: string | null }>
}) {
  const upserts: Upsert[] = []
  const client = {
    from(table: string) {
      if (table === 'reps') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: input.reps ?? null, error: input.repsError ?? null }),
          }),
        }
      }
      if (table === 'action_events') {
        const chain = {
          eq: () => chain,
          gte: () => chain,
          lt: () => chain,
          limit: () => Promise.resolve({ data: input.activity ?? [], error: null }),
        }
        return { select: () => chain }
      }
      if (table === 'rep_day') {
        return {
          upsert: (rows: Array<Record<string, unknown>>, options: Record<string, unknown>) => {
            upserts.push({ rows, options })
            return Promise.resolve({ error: null })
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { client, upserts }
}

describe('ensureRepDays', () => {
  it('creates one NOT_STARTED row per rep when there is no activity', async () => {
    const { client, upserts } = fakeClient({ reps: [{ id: 'rep-1' }, { id: 'rep-2' }] })

    const result = await ensureRepDays(client as never, ORG, DATE, POLICY)

    expect(result.reps).toBe(2)
    expect(upserts[0].rows).toEqual([
      { organization_id: ORG, rep_id: 'rep-1', business_date: DATE, state: 'NOT_STARTED' },
      { organization_id: ORG, rep_id: 'rep-2', business_date: DATE, state: 'NOT_STARTED' },
    ])
  })

  it('marks a rep ACTIVE when they already have activity today', async () => {
    const { client, upserts } = fakeClient({
      reps: [{ id: 'rep-1' }, { id: 'rep-2' }],
      activity: [{ actor_id: 'rep-1' }, { actor_id: null }],
    })

    await ensureRepDays(client as never, ORG, DATE, POLICY)

    expect(upserts[0].rows).toEqual([
      { organization_id: ORG, rep_id: 'rep-1', business_date: DATE, state: 'ACTIVE' },
      { organization_id: ORG, rep_id: 'rep-2', business_date: DATE, state: 'NOT_STARTED' },
    ])
  })

  it('is idempotent: conflicts are ignored, so a check-in is never reset', async () => {
    const { client, upserts } = fakeClient({ reps: [{ id: 'rep-1' }] })

    await ensureRepDays(client as never, ORG, DATE, POLICY)

    expect(upserts[0].options).toMatchObject({
      onConflict: 'organization_id,rep_id,business_date',
      ignoreDuplicates: true,
    })
  })

  it('does nothing when the organization has no reps', async () => {
    const { client, upserts } = fakeClient({ reps: [] })
    const result = await ensureRepDays(client as never, ORG, DATE, POLICY)

    expect(result.reps).toBe(0)
    expect(upserts).toHaveLength(0)
  })

  it('does nothing when the reps table is missing', async () => {
    const { client, upserts } = fakeClient({
      reps: null,
      repsError: { message: 'relation "reps" does not exist', code: '42P01' },
    })
    const result = await ensureRepDays(client as never, ORG, DATE, POLICY)

    expect(result.reps).toBe(0)
    expect(upserts).toHaveLength(0)
  })
})
