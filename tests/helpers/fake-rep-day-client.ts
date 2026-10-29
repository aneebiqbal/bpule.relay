/**
 * Minimal Supabase stub for rep-day persistence tests.
 *
 * It implements only the chain shapes the code actually uses, and records what
 * was written so a test can assert the shortfall and the exception were stored.
 * No network, no mocks library.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePolicy } from '@/lib/org-clock'

export interface FakeCheckInRow {
  id: string
  check_in_at: string | null
}

export function makeCheckInClient(
  initial: FakeCheckInRow | null,
  options: { insertError?: { code?: string; message?: string } } = {},
) {
  let row = initial
  const inserts: Record<string, unknown>[] = []

  const client = {
    from() {
      return {
        select() {
          return {
            match() {
              return {
                maybeSingle: async () => ({ data: row, error: null }),
              }
            },
          }
        },
        update(payload: Record<string, unknown>) {
          return {
            eq: async () => {
              if (row) row = { ...row, ...(payload as Partial<FakeCheckInRow>) }
              return { error: null }
            },
          }
        },
        insert(payload: Record<string, unknown>) {
          if (options.insertError) return { error: options.insertError }
          inserts.push(payload)
          row = { id: 'inserted', check_in_at: (payload.check_in_at as string) ?? null }
          return { error: null }
        },
      }
    },
  }

  return { client: client as unknown as SupabaseClient, inserts, row: () => row }
}

export function makeUpdateClient() {
  let written: Record<string, unknown> | null = null
  let error: { code?: string; message?: string } | null = null

  const builder = {
    update(payload: Record<string, unknown>) {
      written = payload
      return {
        eq() {
          return {
            eq() {
              return {
                eq: async () => ({ error }),
              }
            },
          }
        },
      }
    },
  }

  return {
    client: { from: () => builder } as unknown as SupabaseClient,
    written: () => written,
    failWith: (next: { code?: string; message?: string } | null) => {
      error = next
    },
  }
}

/** A commitment row for a close/shortfall test. */
export function makeCommitment(
  overrides: Partial<import('@/lib/rep-day/commitments').CommitmentRow> & { key: string; label: string },
): import('@/lib/rep-day/commitments').CommitmentRow {
  return {
    target: 10,
    completed: 10,
    remaining: 0,
    unit: 'count',
    measured: true,
    seeded: false,
    sources: [],
    ...overrides,
  }
}

/** A complete RepDayView, so a test only states the fields it cares about. */
export function makeRepDayView(
  overrides: Partial<import('@/lib/rep-day/load').RepDayView> = {},
): import('@/lib/rep-day/load').RepDayView {
  return {
    repId: 'rep-1',
    repName: 'Madiha',
    organizationId: 'org-1',
    businessDate: '2026-10-30',
    timezone: 'Asia/Karachi',
    isWorkingDay: true,
    applicable: true,
    state: 'AT_RISK',
    reason: 'behind',
    checkInAt: '2026-10-30T04:05:00.000Z',
    closedAt: null,
    workdayProgress: 0.7,
    commitmentProgress: 0.4,
    paceRatio: 0.57,
    minutesRemaining: 160,
    minutesRemainingLabel: '2h 40m',
    requiredRemaining: 12,
    commitments: [
      makeCommitment({ key: 'profiles_supplied', label: 'Profiles', target: 25, completed: 18, remaining: 7 }),
      makeCommitment({ key: 'followups_completed', label: 'Follow-ups', target: 10, completed: 5, remaining: 5 }),
      makeCommitment({ key: 'replies_handled', label: 'Replies', target: 100, completed: 100, remaining: 0, unit: 'percent' }),
    ],
    exception: { state: 'NONE', reason: null, note: null, reviewedBy: null, reviewedAt: null },
    shortfall: {},
    carryover: {},
    persisted: true,
    policy: normalizePolicy({ organizationId: 'org-1', timezone: 'Asia/Karachi' }),
    ...overrides,
  }
}
