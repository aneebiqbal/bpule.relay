/**
 * SPACING_CONCURRENCY_GATE
 *
 * Two workers must not both pass a minimum-spacing check by reading the same
 * stale `last_send_at`. The guard is a single conditional UPDATE, so this test
 * models that atomicity: each claim checks and sets under one lock, exactly as
 * Postgres does for the duration of the statement.
 *
 * Assertions are on the guard's return value — that is the contract the send
 * path consumes. The fake's internal row state is an implementation detail of
 * the harness, not of the guard.
 */
import { describe, expect, it } from 'vitest'
import { claimSendSlot, releaseSendSlot } from '@/lib/email/spacing-guard'

const ORG = '11111111-1111-1111-1111-111111111111'
const MAILBOX = 'mailbox-1'

/**
 * A fake that behaves like the real row lock.
 *
 * The predicate is evaluated against the value the row holds *at the moment of
 * the update*, and the write happens in the same step. Two claims therefore
 * cannot both see the same stale value.
 */
function lockedMailbox(initial: string | null) {
  const state = { lastSentAt: initial as string | null, updates: 0 }

  const client = {
    from() {
      return {
        update(patch: { last_sent_at: string }) {
          const updateChain: Record<string, unknown> = {}
          updateChain.eq = () => updateChain

          // A bare update (the release path) applies immediately. The claim path
          // supplies an `or` predicate, which gates the write.
          updateChain.then = (resolve: (value: unknown) => void) => {
            state.lastSentAt = patch.last_sent_at
            resolve(null)
          }

          updateChain.or = (predicate: string) => {
            state.updates += 1

            const threshold = predicate.match(/last_send_at\.lte\.([^,]+)/)?.[1] ?? null
            const allowsNull = predicate.includes('last_send_at.is.null')
            const current = state.lastSentAt
            const eligible =
              current === null
                ? allowsNull
                : threshold !== null && new Date(current).getTime() <= new Date(threshold).getTime()

            const result: Record<string, unknown> = {}
            result.select = () => {
              if (eligible) {
                state.lastSentAt = patch.last_sent_at
                return Promise.resolve({ data: [{ id: MAILBOX }], error: null })
              }
              return Promise.resolve({ data: [], error: null })
            }
            return result
          }
          return updateChain
        },
        select() {
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { last_send_at: state.lastSentAt }, error: null }),
              }),
            }),
          }
        },
      }
    },
  }

  return { client, state, updateCount: () => state.updates }
}

const INPUT = {
  organizationId: ORG,
  mailboxId: MAILBOX,
  minimumSpacingMinutes: 4,
  now: new Date('2026-10-30T10:00:00Z'),
}

describe('claimSendSlot', () => {
  it('claims when the mailbox has never sent', async () => {
    const result = await claimSendSlot(lockedMailbox(null).client as never, INPUT)
    expect(result).toEqual({ claimed: true, reason: 'claimed', nextSendAt: null })
  })

  it('refuses a second claim inside the spacing window', async () => {
    const result = await claimSendSlot(lockedMailbox('2026-10-30T09:58:00Z').client as never, INPUT)
    expect(result.claimed).toBe(false)
    expect(result.reason).toBe('spacing_not_elapsed')
    expect(result.nextSendAt).toBe('2026-10-30T10:02:00.000Z')
  })

  it('claims once the window has elapsed', async () => {
    const result = await claimSendSlot(lockedMailbox('2026-10-30T09:00:00Z').client as never, INPUT)
    expect(result.claimed).toBe(true)
  })

  it('two concurrent claims produce exactly one winner', async () => {
    // Start clean: the first claim is eligible, the second then sees the row the
    // first one just wrote.
    const box = lockedMailbox(null)
    const [first, second] = await Promise.all([
      claimSendSlot(box.client as never, INPUT),
      claimSendSlot(box.client as never, INPUT),
    ])

    expect([first.claimed, second.claimed].filter(Boolean)).toHaveLength(1)
  })

  it('does not claim twice when the first claim advanced the row', async () => {
    const box = lockedMailbox(null)
    await claimSendSlot(box.client as never, INPUT)
    const second = await claimSendSlot(box.client as never, INPUT)

    expect(second.claimed).toBe(false)
    expect(second.reason).toBe('spacing_not_elapsed')
  })

  it('treats zero spacing as nothing to claim', async () => {
    const box = lockedMailbox('2026-10-30T09:59:00Z')
    const result = await claimSendSlot(box.client as never, { ...INPUT, minimumSpacingMinutes: 0 })

    expect(result.claimed).toBe(true)
    expect(box.updateCount()).toBe(0)
  })

  it('degrades rather than blocking when the column is absent', async () => {
    const client = {
      from() {
        return {
          update() {
            const chain: Record<string, unknown> = {}
            chain.eq = () => chain
            chain.or = () => ({
              select: () =>
                Promise.resolve({
                  data: null,
                  error: { code: '42703', message: 'column "last_send_at" does not exist' },
                }),
            })
            return chain
          },
        }
      },
    }

    const result = await claimSendSlot(client as never, INPUT)

    expect(result.claimed).toBe(true)
    expect(result.reason).toBe('column_unavailable')
  })

  it('releases a claim so a failed send does not consume the slot', async () => {
    const calls: Array<Record<string, unknown>> = []
    const client = {
      from() {
        return {
          update(patch: Record<string, unknown>) {
            calls.push(patch)
            const chain: Record<string, unknown> = {}
            chain.eq = () => chain
            chain.then = (resolve: (value: unknown) => void) => resolve(null)
            return chain
          },
        }
      },
    }

    await releaseSendSlot(client as never, {
      organizationId: ORG,
      mailboxId: MAILBOX,
      previousLastSentAt: '2026-10-30T09:00:00Z',
    })

    // The release writes the previous value back, freeing the slot.
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ last_send_at: '2026-10-30T09:00:00Z' })
  })

  it('does not write when there is nothing to release', async () => {
    const calls: Array<Record<string, unknown>> = []
    const client = {
      from() {
        return {
          update(patch: Record<string, unknown>) {
            calls.push(patch)
            const chain: Record<string, unknown> = {}
            chain.eq = () => chain
            chain.then = (resolve: (value: unknown) => void) => resolve(null)
            return chain
          },
        }
      },
    }

    await releaseSendSlot(client as never, {
      organizationId: ORG,
      mailboxId: MAILBOX,
      previousLastSentAt: null,
    })

    expect(calls).toHaveLength(0)
  })
})
